import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { queryRowsRaw, queryRowsInTransaction, executeInTransaction, withTransaction, type Row } from "./db";
import { businessRate, contractTarget, financialAmounts, money, PREPAYMENT_SOURCE, progressLabel, readBusinessRequest, validateAllocationTotals, numberValue, type ReceiptInput, type PrepaymentBusinessRequest } from "./prepayment-finance";

const CONTRACTS = "merge_power_prepaymentcontracts";
const text = (value: unknown) => String(value ?? "").trim();
const query = (connection?: PoolConnection) => <T extends Row = Row>(sql: string, params: Row = {}) => connection ? queryRowsInTransaction<T>(connection, sql, params) : queryRowsRaw<T>(sql, params);

export async function getFinanceContract(id: string, connection?: PoolConnection, lock = false) {
  const [contract] = await query(connection)(`SELECT * FROM ${CONTRACTS} WHERE financeId=:id${lock ? " FOR UPDATE" : ""}`, { id });
  if (!contract) throw new Error("预付款合同不存在或尚未升级财务结构，请刷新");
  return contract;
}

async function totals(contract: Row, connection?: PoolConnection, excludeApproval?: string) {
  const id = text(contract.financeId);
  const q = query(connection);
  const [invoices] = await q(`SELECT COALESCE(SUM(l.sourceAmountIncludingTax),0) AS total FROM merge_common_invoice_business_links l JOIN merge_common_invoices i ON i.id=l.invoiceId AND i.status='issued' WHERE l.sourceType='prepayment_contract' AND l.sourceId=:id`, { id });
  const [receipts] = await q("SELECT COALESCE(SUM(sourceAmountIncludingTax),0) AS total FROM merge_common_receipts WHERE sourceType='prepayment_contract' AND sourceId=:id AND status='active' AND isReceived=1", { id });
  const approvals = await q("SELECT instanceCode,businessRequestJson FROM merge_common_feishu_approvals WHERE ownerType='prepayment_contract' AND ownerId=:id AND status IN ('pending','returned','approved') AND (invoiceId IS NULL OR invoiceId='')", { id });
  let reserved = 0;
  for (const approval of approvals) {
    if (approval.instanceCode === excludeApproval) continue;
    const request = readBusinessRequest(approval.businessRequestJson);
    if (!request) throw new Error("预付款审批金额快照缺失，请核对审批记录");
    reserved += money(Number(request.amountIncludingTax) * businessRate(request.currency, contract.currency, request.businessExchangeRate));
  }
  const target = contractTarget(contract.totalAmount, contract.financeAmountBasis, contract.financeTaxRate);
  const invoiced = money(Number(invoices.total));
  const received = money(Number(receipts.total));
  return { target, invoiced, received, reserved: money(reserved), remainingInvoice: target === null ? null : money(Math.max(0, target - invoiced - reserved)), remainingReceipt: target === null ? null : money(Math.max(0, target - received)), invoiceStatus: progressLabel(invoiced, target, "开票"), receiptStatus: progressLabel(received, target, "收款") };
}

function requireConfigured(contract: Row) {
  if (contract.status !== "已确认") throw new Error("请先确认预付款合同，再办理开票或收款");
  if (contractTarget(contract.totalAmount, contract.financeAmountBasis, contract.financeTaxRate) === null) throw new Error("请先设置合同金额口径及税率");
}

export async function prepaymentInvoicePrefill(id: string) {
  const contract = await getFinanceContract(id);
  requireConfigured(contract);
  const summary = await totals(contract);
  const parties = await queryRowsRaw("SELECT DISTINCT customerId,undertakingUnitId FROM merge_power_prepaymentcontractitems WHERE contractNo=:no", { no: contract.contractNo });
  const unique = (key: string) => { const values = [...new Set(parties.map(row => text(row[key])).filter(Boolean))]; return values.length === 1 ? values[0] : ""; };
  const amounts = financialAmounts(summary.remainingInvoice ?? 0, contract.financeTaxRate);
  return { sourceNo: text(contract.contractNo), customerId: text(contract.financeCustomerId) || unique("customerId"), undertakingUnitId: text(contract.financeUnitId) || unique("undertakingUnitId"), currency: text(contract.currency), contractCurrency: text(contract.currency), businessExchangeRate: "1", amountExcludingTax: String(amounts.amountExcludingTax), taxRate: String(amounts.taxRate), taxAmount: String(amounts.taxAmount), amountIncludingTax: String(amounts.amountIncludingTax) };
}

/** Called inside the invoice/approval transaction. The contract row serializes all financial mutations. */
export async function lockPrepaymentCapacity(connection: PoolConnection, id: string, request: PrepaymentBusinessRequest, excludeApproval?: string) {
  const contract = await getFinanceContract(id, connection, true);
  requireConfigured(contract);
  const rate = businessRate(request.currency, contract.currency, request.businessExchangeRate);
  financialAmounts(request.amountIncludingTax,request.taxRate);
  const amount = money(numberValue(request.amountIncludingTax, "开票含税金额", false) * rate);
  const summary = await totals(contract, connection, excludeApproval);
  if (money(summary.invoiced + summary.reserved + amount) > Number(summary.target)) throw new Error(`本次折合合同币种 ${amount.toFixed(2)} ${contract.currency}，超过剩余可开金额 ${summary.remainingInvoice?.toFixed(2)}（审批中及待出票金额已占用）`);
  return { contract, rate, amount };
}

export async function linkPrepaymentInvoice(connection: PoolConnection, invoiceId: string, id: string, request: PrepaymentBusinessRequest, excludeApproval?: string) {
  const { contract, rate, amount } = await lockPrepaymentCapacity(connection, id, request, excludeApproval);
  await executeInTransaction(connection, `INSERT INTO merge_common_invoice_business_links (id,invoiceId,sourceType,sourceId,sourceNo,sourceCurrency,businessExchangeRate,sourceAmountIncludingTax) VALUES (:id,:invoiceId,'prepayment_contract',:sourceId,:sourceNo,:currency,:rate,:amount)`, { id: randomUUID(), invoiceId, sourceId: id, sourceNo: contract.contractNo, currency: contract.currency, rate, amount });
}

export async function getPrepaymentFinance(contractNo: string) {
  const [contract] = await queryRowsRaw(`SELECT * FROM ${CONTRACTS} WHERE contractNo=:contractNo`, { contractNo });
  if (!contract) throw new Error("合同不存在");
  const id = text(contract.financeId);
  const summary = await totals(contract);
  const invoices = await queryRowsRaw(`SELECT i.id,i.invoiceNo,i.source,i.status,i.currency,i.customerId,i.customerName,i.undertakingUnitId,i.sellerName,i.amountExcludingTax,i.taxRate,i.taxAmount,i.amountIncludingTax,DATE_FORMAT(i.invoiceDate,'%Y-%m-%d') AS invoiceDate,DATE_FORMAT(i.dueDate,'%Y-%m-%d') AS dueDate,i.fileName,i.approvalInstanceCode,l.businessExchangeRate,l.sourceAmountIncludingTax,COALESCE(p.paid,0) AS receivedAmount
    FROM merge_common_invoice_business_links l JOIN merge_common_invoices i ON i.id=l.invoiceId
    LEFT JOIN (SELECT a.invoiceId,SUM(a.invoiceAmount) AS paid FROM merge_common_receipt_allocations a JOIN merge_common_receipts r ON r.id=a.receiptId WHERE r.status='active' AND r.isReceived=1 GROUP BY a.invoiceId) p ON p.invoiceId=i.id
    WHERE l.sourceType='prepayment_contract' AND l.sourceId=:id ORDER BY i.createdAt DESC`, { id });
  const receipts = await queryRowsRaw("SELECT *,DATE_FORMAT(receivedDate,'%Y-%m-%d') AS receivedDateText FROM merge_common_receipts WHERE sourceType='prepayment_contract' AND sourceId=:id ORDER BY createdAt DESC", { id });
  const allocations = receipts.length ? await queryRowsRaw("SELECT a.* FROM merge_common_receipt_allocations a JOIN merge_common_receipts r ON r.id=a.receiptId WHERE r.sourceType='prepayment_contract' AND r.sourceId=:id", { id }) : [];
  return { contract: { financeId: id, contractNo, status: contract.status, currency: contract.currency, totalAmount: contract.totalAmount, financeAmountBasis: contract.financeAmountBasis, financeTaxRate: contract.financeTaxRate, financeCustomerId: contract.financeCustomerId, financeUnitId: contract.financeUnitId, financeVersion: contract.financeVersion }, summary, invoices, receipts: receipts.map((row): Row & { allocations: Row[] } => ({ ...row, receivedDate: row.receivedDateText, allocations: allocations.filter(item => item.receiptId === row.id) })) };
}

export async function savePrepaymentSettings(contractNo: string, input: { basis: string; taxRate: unknown; customerId?: string; undertakingUnitId?: string; version: number }) {
  return withTransaction(async connection => {
    const [contract] = await queryRowsInTransaction<Row>(connection, `SELECT * FROM ${CONTRACTS} WHERE contractNo=:contractNo FOR UPDATE`, { contractNo });
    if (!contract) throw new Error("合同不存在");
    if (Number(contract.financeVersion) !== Number(input.version)) throw new Error("财务设置已被其他人修改，请刷新");
    const target = contractTarget(contract.totalAmount, input.basis, input.taxRate);
    if (target === null) throw new Error("请选择合同金额口径");
    const current = await totals(contract, connection);
    if (target < money(current.invoiced + current.reserved) || target < current.received) throw new Error("新合同含税总额不能低于已开票及审批占用金额或已收款金额");
    await validateParties(connection, input.customerId, input.undertakingUnitId, false);
    await executeInTransaction(connection, `UPDATE ${CONTRACTS} SET financeAmountBasis=:basis,financeTaxRate=:taxRate,financeCustomerId=:customerId,financeUnitId=:unitId,financeVersion=financeVersion+1 WHERE contractNo=:contractNo`, { contractNo, basis: input.basis, taxRate: Number(input.taxRate), customerId: input.customerId || null, unitId: input.undertakingUnitId || null });
  });
}

async function validateParties(connection: PoolConnection, customerId?: string, unitId?: string, required = true) {
  for (const [id,table,key,label] of [[customerId,"merge_common_customers","customerId","客户"],[unitId,"merge_common_undertaking_units","undertakingUnitId","承接单位"]]) {
    if (!id && !required) continue;
    if (!id || !(await queryRowsInTransaction(connection, `SELECT ${key} FROM ${table} WHERE ${key}=:id`, { id })).length) throw new Error(`请选择有效的${label}`);
  }
}

export async function savePrepaymentReceipt(contractNo: string, input: ReceiptInput, actor: string) {
  return withTransaction(async connection => {
    const q = query(connection);
    const [contract] = await q(`SELECT * FROM ${CONTRACTS} WHERE contractNo=:contractNo FOR UPDATE`, { contractNo });
    if (!contract) throw new Error("合同不存在");
    requireConfigured(contract);
    const sourceId = text(contract.financeId);
    const existing = input.id ? (await q("SELECT * FROM merge_common_receipts WHERE id=:id AND sourceType='prepayment_contract' AND sourceId=:sourceId FOR UPDATE", { id: input.id, sourceId }))[0] : null;
    if (input.id && (!existing || existing.status !== "active")) throw new Error("收款记录不存在或已作废");
    if (existing && Number(existing.version) !== Number(input.version)) throw new Error("收款记录已更新，请刷新后编辑");
    if (!text(input.requestKey) || input.requestKey.length > 64) throw new Error("缺少收款请求标识，请重新打开表单");
    if (!existing) {
      const [duplicate] = await q("SELECT id FROM merge_common_receipts WHERE sourceType='prepayment_contract' AND sourceId=:sourceId AND requestKey=:key", { sourceId, key: input.requestKey });
      if (duplicate) return duplicate.id; // retry after a lost HTTP response
    }
    await validateParties(connection, input.customerId, input.undertakingUnitId);
    const currency = text(input.currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("币种需为3位英文代码");
    const rate = businessRate(currency, contract.currency, input.businessExchangeRate);
    const amounts = financialAmounts(input.amountIncludingTax, input.taxRate);
    if (amounts.amountIncludingTax <= 0) throw new Error("收款金额必须大于0");
    // Accept independently entered net/tax only when they reconcile, allowing invoice rounding.
    if (input.amountExcludingTax !== undefined && text(input.amountExcludingTax) !== "") {
      const net = money(numberValue(input.amountExcludingTax, "实收未税金额"));
      const tax = money(amounts.amountIncludingTax - net);
      if (tax < 0 || Math.abs(money(net * amounts.taxRate / 100) - tax) > 0.02) throw new Error("实收未税、税率与含税金额不一致");
      amounts.amountExcludingTax = net; amounts.taxAmount = tax;
    }
    const isReceived = input.isReceived === true;
    const date = text(input.receivedDate);
    if ((isReceived || date) && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) throw new Error("请填写有效的实收日期");
    if (text(input.bankSerialNo).length > 255) throw new Error("银行流水号不能超过255个字符");
    const converted = money(amounts.amountIncludingTax * rate);
    const summary = await totals(contract, connection);
    const oldReceived = existing && Number(existing.isReceived) === 1 ? Number(existing.sourceAmountIncludingTax) : 0;
    if (isReceived && money(summary.received - oldReceived + converted) > Number(summary.target)) throw new Error("累计实收金额超过合同含税金额，请核对本笔金额与汇率");
    const allocations = input.allocations ?? [];
    if (allocations.length > 200 || new Set(allocations.map(row => row.invoiceId)).size !== allocations.length) throw new Error("发票关联重复或数量过多");
    validateAllocationTotals(amounts.amountIncludingTax, allocations.map(row => ({ amount: Number(row.amount) })));
    const prepared: Array<{ invoiceId: string; amount: number; invoiceRate: number; invoiceAmount: number }> = [];
    for (const row of [...allocations].sort((a,b) => a.invoiceId.localeCompare(b.invoiceId))) {
      const amount = money(numberValue(row.amount, "分配金额"));
      if (!amount) continue;
      const [invoice] = await q("SELECT i.* FROM merge_common_invoices i JOIN merge_common_invoice_business_links l ON l.invoiceId=i.id WHERE l.sourceType='prepayment_contract' AND l.sourceId=:sourceId AND i.id=:id AND i.status='issued' FOR UPDATE", { sourceId, id: row.invoiceId });
      if (!invoice) throw new Error("关联发票不属于本合同或已作废");
      const invoiceRate = businessRate(currency, invoice.currency, row.invoiceExchangeRate);
      const invoiceAmount = money(amount * invoiceRate);
      const [paid] = await q("SELECT COALESCE(SUM(a.invoiceAmount),0) AS total FROM merge_common_receipt_allocations a JOIN merge_common_receipts r ON r.id=a.receiptId WHERE a.invoiceId=:id AND r.status='active' AND r.isReceived=1 AND r.id<>:receiptId", { id: row.invoiceId, receiptId: input.id || "" });
      if (isReceived && money(Number(paid.total) + invoiceAmount) > money(Number(invoice.amountIncludingTax))) throw new Error(`发票 ${invoice.invoiceNo} 的分配金额超过未收余额`);
      prepared.push({ invoiceId: row.invoiceId, amount, invoiceRate, invoiceAmount });
    }
    const id = input.id || randomUUID();
    const values: Row = { id, sourceId, requestKey: input.requestKey, customerId: input.customerId, unitId: input.undertakingUnitId, currency, exchangeRate: text(input.exchangeRate) ? numberValue(input.exchangeRate, "发票汇率", false) : null, rate, sourceCurrency: contract.currency, converted, net: amounts.amountExcludingTax, taxRate: amounts.taxRate, tax: amounts.taxAmount, gross: amounts.amountIncludingTax, date: date || null, received: isReceived ? 1 : 0, bank: text(input.bankSerialNo) || null, remark: text(input.remark) || null, actor };
    if (existing) await executeInTransaction(connection, `UPDATE merge_common_receipts SET customerId=:customerId,undertakingUnitId=:unitId,currency=:currency,exchangeRate=:exchangeRate,businessExchangeRate=:rate,sourceCurrency=:sourceCurrency,sourceAmountIncludingTax=:converted,amountExcludingTax=:net,taxRate=:taxRate,taxAmount=:tax,amountIncludingTax=:gross,receivedDate=:date,isReceived=:received,bankSerialNo=:bank,remark=:remark,updatedBy=:actor,version=version+1 WHERE id=:id`, values);
    else await executeInTransaction(connection, `INSERT INTO merge_common_receipts (id,sourceType,sourceId,requestKey,customerId,undertakingUnitId,currency,exchangeRate,businessExchangeRate,sourceCurrency,sourceAmountIncludingTax,amountExcludingTax,taxRate,taxAmount,amountIncludingTax,receivedDate,isReceived,bankSerialNo,remark,createdBy,updatedBy) VALUES (:id,'prepayment_contract',:sourceId,:requestKey,:customerId,:unitId,:currency,:exchangeRate,:rate,:sourceCurrency,:converted,:net,:taxRate,:tax,:gross,:date,:received,:bank,:remark,:actor,:actor)`, values);
    await executeInTransaction(connection, "DELETE FROM merge_common_receipt_allocations WHERE receiptId=:id", { id });
    for (const row of prepared) await executeInTransaction(connection, "INSERT INTO merge_common_receipt_allocations (id,receiptId,invoiceId,amount,invoiceExchangeRate,invoiceAmount) VALUES (:id,:receiptId,:invoiceId,:amount,:invoiceRate,:invoiceAmount)", { id: randomUUID(), receiptId: id, ...row });
    return id;
  });
}

export async function voidPrepaymentReceipt(contractNo: string, id: string, version: number, reason: string, actor: string) {
  if (!text(reason)) throw new Error("请填写作废原因");
  await withTransaction(async connection => {
    const [contract] = await query(connection)(`SELECT financeId FROM ${CONTRACTS} WHERE contractNo=:contractNo FOR UPDATE`, { contractNo });
    const [receipt] = await query(connection)("SELECT * FROM merge_common_receipts WHERE id=:id AND sourceType='prepayment_contract' AND sourceId=:sourceId FOR UPDATE", { id, sourceId: contract?.financeId || "" });
    if (!receipt || receipt.status !== "active" || Number(receipt.version) !== Number(version)) throw new Error("收款记录已变化，请刷新");
    await executeInTransaction(connection, "UPDATE merge_common_receipts SET status='void',voidReason=:reason,updatedBy=:actor,version=version+1 WHERE id=:id", { id, reason, actor });
  });
}

export async function voidPrepaymentInvoice(id: string, reason: string, actor: string) {
  if (!text(reason)) throw new Error("请填写作废原因");
  await withTransaction(async connection => {
    const [link] = await query(connection)("SELECT sourceId FROM merge_common_invoice_business_links WHERE invoiceId=:id AND sourceType='prepayment_contract'", { id });
    if (!link) throw new Error("预付款发票关联不存在");
    await getFinanceContract(text(link.sourceId), connection, true);
    const [invoice] = await query(connection)("SELECT status FROM merge_common_invoices WHERE id=:id FOR UPDATE", { id });
    if (invoice?.status !== "issued") throw new Error("发票已作废或不存在");
    const references = await query(connection)("SELECT a.id FROM merge_common_receipt_allocations a JOIN merge_common_receipts r ON r.id=a.receiptId WHERE a.invoiceId=:id AND r.status='active' LIMIT 1 FOR UPDATE", { id });
    if (references.length) throw new Error("该发票已关联收款记录，请先编辑收款解除关联或作废相关收款");
    await executeInTransaction(connection, "UPDATE merge_common_invoices SET status='void',voidReason=:reason,voidedAt=NOW(),updatedByName=:actor WHERE id=:id", { id, reason, actor });
    // Keep approval.invoiceId: a voided invoice must never be re-imported by the poller.
  });
}

export async function assertNoPrepaymentFinance(contractNo: string, connection?: PoolConnection) {
  const [contract] = await query(connection)(`SELECT financeId FROM ${CONTRACTS} WHERE contractNo=:contractNo`, { contractNo });
  if (!contract?.financeId) return;
  const params = { id: contract.financeId };
  const [used] = await query(connection)(`SELECT (EXISTS(SELECT 1 FROM merge_common_invoice_business_links WHERE sourceType='prepayment_contract' AND sourceId=:id) OR EXISTS(SELECT 1 FROM merge_common_receipts WHERE sourceType='prepayment_contract' AND sourceId=:id) OR EXISTS(SELECT 1 FROM merge_common_feishu_approvals WHERE ownerType='prepayment_contract' AND ownerId=:id)) AS used`, params);
  if (Number(used.used)) throw new Error("合同已有开票、审批或收款记录，不能删除或撤销确认；请保留财务关联记录");
}

export async function prepaymentFinanceSummaries(contractNos: string[]) {
  if (!contractNos.length) return [];
  if (contractNos.length > 200) throw new Error("一次最多查询200张合同");
  // Batched aggregates: no per-contract queries, and no receipt×invoice join multiplication.
  const rows = await queryRowsRaw(`SELECT c.contractNo,c.currency,c.totalAmount,c.financeAmountBasis,c.financeTaxRate,COALESCE(i.total,0) AS invoiced,COALESCE(r.total,0) AS received FROM ${CONTRACTS} c
    LEFT JOIN (SELECT l.sourceId,SUM(l.sourceAmountIncludingTax) AS total FROM merge_common_invoice_business_links l JOIN merge_common_invoices i ON i.id=l.invoiceId AND i.status='issued' WHERE l.sourceType='prepayment_contract' GROUP BY l.sourceId) i ON i.sourceId=c.financeId
    LEFT JOIN (SELECT sourceId,SUM(sourceAmountIncludingTax) AS total FROM merge_common_receipts WHERE sourceType='prepayment_contract' AND status='active' AND isReceived=1 GROUP BY sourceId) r ON r.sourceId=c.financeId
    WHERE c.contractNo IN (:nos)`, { nos: contractNos });
  return rows.map((row): Row => { const target = contractTarget(row.totalAmount,row.financeAmountBasis,row.financeTaxRate); return { ...row, target, invoiceStatus: progressLabel(Number(row.invoiced),target,"开票"), receiptStatus: progressLabel(Number(row.received),target,"收款") }; });
}
