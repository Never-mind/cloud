/**
 * 飞书审批回传的发票附件 → 挂到**来源单据**的附件位。
 *
 * 各来源沿用本地开票时的那套落点：
 *   cloud_row          华为云对账行的「客户开票」附件（云附件表）
 *   billing_statement  月账单对账单附件表
 *   service_fee        服务费对账单的「客户开票」附件（表内单附件，只放 PDF）
 *   settlement_invoice 集采项目结算附件
 */
import { listCloudAttachments, storeCloudAttachment } from "./cloud-service";
import { queryRows } from "./db";

export type ApprovalStoredFile = {
  fileName: string;
  fileType: string;
  fileSize: number;
  storageProvider: string;
  storageKey: string | null;
};

export function toDataUrlBytes(fileType: string, bytes: Buffer) {
  return `data:${fileType || "application/octet-stream"};base64,${bytes.toString("base64")}`;
}

export async function attachApprovalFilesToSource(
  sourceType: string,
  ownerId: string,
  files: Array<{ fileName: string; fileType: string; bytes: Buffer }>,
): Promise<{ stored: ApprovalStoredFile[]; attachedNames: string[] }> {
  const stored: ApprovalStoredFile[] = [];
  const attachedNames: string[] = [];
  const actorLabel = "飞书审批回传";

  if (sourceType === "cloud_row") {
    const existing = new Set((await listCloudAttachments("invoice", ownerId)).map((item) => String(item.fileName ?? "")));
    for (const file of files) {
      if (existing.has(file.fileName)) continue;
      const attachment = await storeCloudAttachment(
        "invoice",
        ownerId,
        { fileName: file.fileName, fileType: file.fileType, bytes: file.bytes },
        { userId: "", displayName: actorLabel, email: "" },
      ) as Record<string, unknown>;
      stored.push({
        fileName: String(attachment.fileName ?? file.fileName),
        fileType: String(attachment.fileType ?? file.fileType),
        fileSize: Number(attachment.fileSize ?? file.bytes.length),
        storageProvider: String(attachment.storageProvider ?? "db"),
        storageKey: attachment.storageKey ? String(attachment.storageKey) : null,
      });
      attachedNames.push(file.fileName);
    }
    return { stored, attachedNames };
  }

  if (sourceType === "billing_statement") {
    const { addStatementAttachment } = await import("./billing-statement-attachment-service");
    for (const file of files) {
      const created = await addStatementAttachment(ownerId, {
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: file.bytes.length,
        dataUrl: toDataUrlBytes(file.fileType, file.bytes),
        description: "飞书审批回传发票",
      }, null);
      const [row] = await queryRows<{ storageKey: string | null }>(
        "SELECT storageKey FROM merge_power_billingstatement_attachments WHERE id = :id LIMIT 1",
        { id: created.id },
      );
      stored.push({
        fileName: created.fileName,
        fileType: file.fileType,
        fileSize: file.bytes.length,
        storageProvider: String(created.provider ?? "db"),
        storageKey: row?.storageKey ? String(row.storageKey) : null,
      });
      attachedNames.push(file.fileName);
    }
    return { stored, attachedNames };
  }

  if (sourceType === "service_fee") {
    const { saveServiceFeeInvoice } = await import("./service-fee-service");
    // 服务费对账单的发票附件是表内单附件（存服务器本地盘），只能放一个：有 PDF 就放 PDF
    const target = files.find((file) => /\.pdf$/i.test(file.fileName)) ?? files[0];
    if (target) {
      await saveServiceFeeInvoice({
        snapshotNo: ownerId,
        originalName: target.fileName,
        mimeType: target.fileType || "application/pdf",
        bytes: target.bytes,
        uploadedBy: actorLabel,
      });
      stored.push({
        fileName: target.fileName,
        fileType: target.fileType,
        fileSize: target.bytes.length,
        storageProvider: "db",
        storageKey: null,
      });
      attachedNames.push(target.fileName);
    }
    return { stored, attachedNames };
  }

  if (sourceType === "settlement_invoice") {
    const { addSettlementAttachment } = await import("./settlement-project-service");
    const [invoice] = await queryRows<{ projectId: string }>(
      "SELECT projectId FROM merge_po_settlement_invoices WHERE id = :id LIMIT 1",
      { id: ownerId },
    );
    const projectId = String(invoice?.projectId ?? "");
    if (!projectId) throw new Error("集采结算发票没有关联项目，无法挂发票附件");
    const existing = new Set(
      (await queryRows<{ fileName: string }>("SELECT fileName FROM merge_po_settlement_attachments WHERE projectId = :projectId", { projectId }))
        .map((row) => String(row.fileName ?? "")),
    );
    for (const file of files) {
      if (existing.has(file.fileName)) continue;
      await addSettlementAttachment(projectId, {
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: file.bytes.length,
        dataUrl: toDataUrlBytes(file.fileType, file.bytes),
        description: "飞书审批回传发票",
      }, null, ownerId);
      const [row] = await queryRows<{ storageProvider: string | null; storageKey: string | null }>(
        `SELECT storageProvider, storageKey FROM merge_po_settlement_attachments
          WHERE projectId = :projectId AND fileName = :fileName ORDER BY uploadedAt DESC LIMIT 1`,
        { projectId, fileName: file.fileName },
      );
      stored.push({
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: file.bytes.length,
        storageProvider: String(row?.storageProvider ?? "db"),
        storageKey: row?.storageKey ? String(row.storageKey) : null,
      });
      attachedNames.push(file.fileName);
    }
    return { stored, attachedNames };
  }

  return { stored, attachedNames };
}
