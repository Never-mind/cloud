import { createHash, randomUUID } from "node:crypto";
import { execute, queryRows, type Row } from "./db";
import { storeFile, readFile } from "./file-storage-service";
import { recognizeInvoiceFile, type InvoiceRecognition } from "./invoice-recognition-service";
import { callFeishu } from "./feishu-approval-service";
import { approvalAttachmentUrl, collectReturnedAttachments, recognizedInvoiceIdentity, groupReturnedInvoices, type ReturnFileSummary } from "./invoice-approval-returns";
import { buildInvoicePrefill, type InvoiceSourceType } from "./invoice-service";
import { defaultInvoicePaymentTermDays } from "./invoice-payment-terms";
import { VAT_APPROVAL_CODE, VAT_FIELDS } from "./vat-invoice-approval";
import { readApprovalPartySnapshot } from "./invoice-approval-party-snapshot";
import {readInvoiceAllocationPlan,allocationTotals,suggestInvoiceAllocations} from "./invoice-allocation";
import {loadAllocationSources} from "./invoice-allocation-service";
import {buildExchangeRateMap,lookupExchangeRate} from "./exchange-rate-service";

const FILE_LIMIT = 20 * 1024 * 1024;
export async function downloadReturnedInvoice(value: string) {
  let url = approvalAttachmentUrl(value);
  const signal = AbortSignal.timeout(30_000);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(url, { redirect: "manual", signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("飞书附件重定向缺少地址");
      url = approvalAttachmentUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !response.body) throw new Error("下载回票附件失败：" + response.status);
    if (Number(response.headers.get("content-length")) > FILE_LIMIT) { await response.body.cancel(); throw new Error("回票附件超过 20 MB"); }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > FILE_LIMIT) { await reader.cancel(); throw new Error("回票附件超过 20 MB"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks);
  }
  throw new Error("飞书附件重定向次数过多");
}

function fileSummary(row: Row): ReturnFileSummary {
  return {
    id: String(row.id), fileName: String(row.fileName), invoiceIdentity: String(row.invoiceIdentity ?? ""),
    invoiceNo: String(row.invoiceNo ?? ""), invoiceId: String(row.invoiceId ?? ""),
    recognition: row.recognitionJson ? JSON.parse(String(row.recognitionJson)) as InvoiceRecognition : null,
    recognitionError: String(row.recognitionError ?? ""), createdAt: String(row.createdAt),
  };
}
export async function listReturnedInvoiceFiles(instanceCode: string): Promise<ReturnFileSummary[]> {
  const rows = await queryRows<Row>("SELECT id, fileName, invoiceIdentity, invoiceNo, invoiceId, recognitionJson, recognitionError, createdAt FROM merge_common_invoice_approval_files WHERE instanceCode = :instanceCode ORDER BY createdAt, id", { instanceCode });
  return rows.map(fileSummary);
}

/** Collect drafts even while approval is pending; only explicit confirmation can post an invoice. */
export async function syncReturnedInvoices(instanceCode: string) {
  const [approval] = await queryRows<Row>("SELECT period, invoiceId FROM merge_common_feishu_approvals WHERE instanceCode = :instanceCode LIMIT 1", { instanceCode });
  if (!approval) throw new Error("审批台账不存在");
  const data = await callFeishu<{ timeline?: Row[]; comment_list?: Row[]; task_list?: Row[] }>(
    "/open-apis/approval/v4/instances/" + encodeURIComponent(instanceCode), {}, "读取回票附件");
  const files = collectReturnedAttachments(data);
  const errors: string[] = [];
  let added = 0;
  for (const file of files) {
    try {
      if (file.size > FILE_LIMIT) throw new Error("附件超过 20 MB，请下载原件后手工登记");
      const bytes = await downloadReturnedInvoice(file.url);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const existing = await queryRows<Row>("SELECT id FROM merge_common_invoice_approval_files WHERE instanceCode = :instanceCode AND contentHash = :hash LIMIT 1", { instanceCode, hash });
      if (existing.length) continue;
      let recognition: InvoiceRecognition | null = null, recognitionError = "";
      try { recognition = await recognizeInvoiceFile({ bytes, fileName: file.title, direction: "income" }); }
      catch (error) { recognitionError = error instanceof Error ? error.message : "识别失败，可手工核对"; }
      const id = randomUUID();
      const fileType = /\.pdf$/i.test(file.title) ? "application/pdf" : /\.xml$/i.test(file.title) ? "application/xml" : /\.ofd$/i.test(file.title) ? "application/ofd" : /\.png$/i.test(file.title) ? "image/png" : "image/jpeg";
      // Stable content-derived storage id makes concurrent sync attempts use the same object.
      const stored = await storeFile({ context: { system: "invoice", period: String(approval.period ?? "") }, attachmentId: createHash("sha256").update(instanceCode + hash).digest("hex"), fileName: file.title, fileType, bytes, isInvoice: true });
      await execute("INSERT INTO merge_common_invoice_approval_files (id, instanceCode, contentHash, remoteKey, fileName, fileType, fileSize, storageProvider, storageKey, dataUrl, uploadedAt, nodeId, origin, recognitionJson, recognitionError, invoiceIdentity, invoiceNo) VALUES (:id, :instanceCode, :hash, :remoteKey, :fileName, :fileType, :size, :provider, :storageKey, :dataUrl, :uploadedAt, :nodeId, :origin, :recognition, :error, :identity, :invoiceNo) ON DUPLICATE KEY UPDATE contentHash = VALUES(contentHash)", {
        id, instanceCode, hash, remoteKey: file.remoteKey, fileName: file.title, fileType, size: bytes.length,
        provider: stored.provider, storageKey: stored.storageKey, dataUrl: stored.provider === "db" ? "data:" + fileType + ";base64," + bytes.toString("base64") : null,
        uploadedAt: file.createdAt, nodeId: file.nodeId, origin: file.origin, recognition: recognition ? JSON.stringify(recognition) : null,
        error: recognitionError.slice(0, 1000), identity: recognizedInvoiceIdentity(recognition) || null, invoiceNo: recognition?.facts?.invoiceNo || null,
      });
      added += 1;
    } catch (error) { errors.push(file.title + "：" + (error instanceof Error ? error.message : "处理失败")); }
  }
  const groups = groupReturnedInvoices(await listReturnedInvoiceFiles(instanceCode));
  const note = errors.length ? errors.join("；") : groups.length ? "回票已取回，请核对识别结果后确认登记" : "尚未发现回传发票";
  await execute("UPDATE merge_common_feishu_approvals SET invoiceParseJson = :summary, syncError = :error WHERE instanceCode = :instanceCode", {
    instanceCode, summary: JSON.stringify({ version: 2, count: groups.length, pending: groups.filter(group => !group.registered).length, note,
      nodes: (data.task_list ?? []).map(node => ({ nodeId: node.node_id, name: node.node_name, status: node.status, startTime: node.start_time, endTime: node.end_time })) }),
    error: errors.join("；").slice(0, 500),
  });
  return { added, note, errors };
}

export async function returnedInvoiceContent(id: string) {
  const [row] = await queryRows<Row>("SELECT * FROM merge_common_invoice_approval_files WHERE id = :id LIMIT 1", { id });
  if (!row) throw new Error("回票文件不存在");
  const stored = await readFile(row);
  if (!stored) throw new Error("回票原件无法读取");
  return { row, bytes: stored.bytes, fileName: String(row.fileName), fileType: String(row.fileType) };
}

export async function listInvoiceApprovalProgress(sourceType?: string, sourceId?: string, requestedOffset = 0) {
  const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0;
  const where = sourceType && sourceId ? " AND ownerType = :sourceType AND (ownerId = :sourceId OR FIND_IN_SET(:sourceId, allocationSourceIds) > 0)" : "";
  const page = await queryRows<Row>("SELECT id, ownerType, ownerId, ownerNo, approvalCode, instanceCode, serialNumber, status, invoiceId, rejectReason, syncError, allocationSourceIds, submittedAt, lastSyncedAt, invoiceParseJson FROM merge_common_feishu_approvals WHERE ownerType IN ('cloud_row','billing_statement','service_fee','settlement_invoice')" + where + " ORDER BY submittedAt DESC, id DESC LIMIT 51 OFFSET " + offset, { sourceType: sourceType ?? "", sourceId: sourceId ?? "" });
  const approvals = page.slice(0, 50);
  const files = approvals.length ? await queryRows<Row>("SELECT instanceCode, id, fileName, invoiceIdentity, invoiceNo, invoiceId, recognitionJson, recognitionError, createdAt FROM merge_common_invoice_approval_files WHERE instanceCode IN (:codes) ORDER BY createdAt, id", { codes: approvals.map(row => row.instanceCode) }) : [];
  const result = [];
  for (const approval of approvals) {
    const groups = groupReturnedInvoices(files.filter(file => file.instanceCode === approval.instanceCode).map(fileSummary));
    result.push({ ...approval, flow: approval.approvalCode === (process.env.FEISHU_VAT_INVOICE_APPROVAL_CODE?.trim() || VAT_APPROVAL_CODE) ? "vat" : "cloud",
      groups, returnStatus: groups.some(group => !group.registered) ? "pending_review" : approval.invoiceId ? "registered" : "waiting" });
  }
  return { approvals: result, nextOffset: page.length > 50 ? offset + 50 : null };
}

export async function returnedInvoiceReview(id: string) {
  const [file] = await queryRows<Row>("SELECT instanceCode FROM merge_common_invoice_approval_files WHERE id = :id LIMIT 1", { id });
  if (!file) throw new Error("回票文件不存在");
  const [approval] = await queryRows<Row>("SELECT * FROM merge_common_feishu_approvals WHERE instanceCode = :instanceCode LIMIT 1", { instanceCode: file.instanceCode });
  if (!approval) throw new Error("审批台账不存在");
  const files = await listReturnedInvoiceFiles(String(file.instanceCode));
  const group = groupReturnedInvoices(files).find(item => item.files.some(f => f.id === id));
  const allocationSourceIds = String(approval.allocationSourceIds ?? "").split(",").filter(Boolean);
  let allocationPlan=readInvoiceAllocationPlan(approval.allocationPlanJson);
  const base = await buildInvoicePrefill({ sourceType: approval.ownerType as InvoiceSourceType, sourceId: String(approval.ownerId), sourceIds: allocationSourceIds.length > 1 ? allocationSourceIds : undefined });
  const partySnapshot = readApprovalPartySnapshot(approval.partySnapshotJson);
  if (partySnapshot) {
    base.customerId = partySnapshot.customerId; base.undertakingUnitId = partySnapshot.undertakingUnitId;
    base.customerName = String(partySnapshot.customer.name ?? ""); base.customerAddress = String(partySnapshot.customer.address ?? "");
    base.customerTaxNumber = String(partySnapshot.customer.taxId ?? ""); base.sellerName = partySnapshot.sellerName;
    base.paymentTermDays = defaultInvoicePaymentTermDays(partySnapshot.paymentTermDays);
  }
  const matchedUnitId = group?.primary.recognition?.matches?.issuerUnitId || base.undertakingUnitId;
  if (matchedUnitId && (!partySnapshot || matchedUnitId !== partySnapshot.undertakingUnitId)) {
    const [unit] = await queryRows<Row>("SELECT paymentTermDays FROM merge_common_undertaking_units WHERE undertakingUnitId = :id LIMIT 1", { id: matchedUnitId });
    base.paymentTermDays = defaultInvoicePaymentTermDays(unit?.paymentTermDays);
  }
  const fileRecord = await queryRows<Row>("SELECT confirmedJson FROM merge_common_invoice_approval_files WHERE instanceCode = :code AND invoiceId IS NOT NULL AND id IN (:ids) LIMIT 1", { code: file.instanceCode, ids: group?.files.map(item => item.id) ?? [id] });
  const confirmed = fileRecord[0]?.confirmedJson ? JSON.parse(String(fileRecord[0].confirmedJson)) : null;
  let expectedInvoice: { currency: string; amountIncludingTax: string } | null = allocationPlan?{currency:allocationPlan.currency,amountIncludingTax:String(allocationTotals(allocationPlan.allocations).amountIncludingTax)}:null;
  if (approval.approvalCode === (process.env.FEISHU_VAT_INVOICE_APPROVAL_CODE?.trim() || VAT_APPROVAL_CODE)) {
    expectedInvoice = { currency: "CNY", amountIncludingTax: "" };
    try {
      const form: Array<{ id: string; value: unknown }> = JSON.parse(String(approval.formJson ?? "[]"));
      const amount = form.find(item => item.id === VAT_FIELDS.amount)?.value;
      if (String(amount ?? "").trim() && Number.isFinite(Number(amount)) && Number(amount) > 0) expectedInvoice.amountIncludingTax = String(amount);
    } catch { /* Keep the known invoice currency even if a legacy snapshot cannot be read. */ }
  }
  if(!allocationPlan&&allocationSourceIds.length>1&&["cloud_row","service_fee"].includes(String(approval.ownerType))) {
    const sources=await loadAllocationSources(approval.ownerType as "cloud_row"|"service_fee",allocationSourceIds);
    if(sources.length===allocationSourceIds.length) {
      const currency=expectedInvoice?.currency||String(base.currency);
      const rates=await buildExchangeRateMap(sources.map(row=>row.period));
      allocationPlan=suggestInvoiceAllocations(sources.map(row=>({...row,suggestedRate:String(lookupExchangeRate(rates,row.period,row.sourceCurrency,currency)??"")})),currency);
    }
  }
  return { allocationPlan,approval: { instanceCode: String(file.instanceCode), status: String(approval.status), invoiceId: approval.invoiceId,
    sourceType: String(approval.ownerType), sourceId: String(approval.ownerId), allocationSourceIds: String(approval.allocationSourceIds ?? "").split(",").filter(Boolean) },
    base, group, confirmed, expectedInvoice, partySnapshot };
}
