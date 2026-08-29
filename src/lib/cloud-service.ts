import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { executeRaw, queryRowsRaw, type Row } from "./db";
import type { OperationActor } from "./operation-actor";

const CLOUD_ROW_COLUMNS = [
  "period", "batchCode", "customer", "account", "owner", "collectionEntity", "catalogAmount", "partnerAmount",
  "supplierPayable", "supplierTaxRate", "customerReceivable", "customerTaxRate", "grossProfit", "calculationLogic",
  "customerDiscount", "remark", "collectionInvoice", "collected", "confirmed", "paymentDate", "collectionPayer",
  "collectionPayee", "collectionCurrency", "collectionExchangeRate", "collectionNetAmount", "collectionTaxRate",
  "collectionTaxAmount", "collectionTotalAmount", "collectionDate",
] as const;

const CLOUD_IMPORT_HEADERS: Record<string, string> = {
  "期间": "period", "账期": "period", period: "period",
  "批次号": "batchCode", "批次": "batchCode", batch: "batchCode", batchcode: "batchCode",
  "客户": "customer", customer: "customer", "客户名称": "customer",
  "账号": "account", account: "account", "华为云账号": "account",
  "所有者": "owner", owner: "owner", "归属人": "owner",
  "收款主体": "collectionEntity", "收款实体": "collectionEntity", collectionentity: "collectionEntity",
  "目录价": "catalogAmount", catalogamount: "catalogAmount", "目录金额": "catalogAmount",
  "伙伴金额": "partnerAmount", partneramount: "partnerAmount",
  "供应商应付": "supplierPayable", supplierpayable: "supplierPayable",
  "供应商税率": "supplierTaxRate", suppliertaxrate: "supplierTaxRate",
  "客户应收": "customerReceivable", customerreceivable: "customerReceivable",
  "客户税率": "customerTaxRate", customertaxrate: "customerTaxRate",
  "毛利": "grossProfit", grossprofit: "grossProfit",
  "计算逻辑": "calculationLogic", calculationlogic: "calculationLogic",
  "客户折扣": "customerDiscount", customerdiscount: "customerDiscount",
  "备注": "remark", remark: "remark",
};

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pageParams(params: URLSearchParams) {
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? 20) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function cloudWhere(params: URLSearchParams) {
  const conditions: string[] = [];
  const values: Record<string, unknown> = {};
  const keyword = text(params.get("keyword"));
  if (keyword) {
    conditions.push("(customer LIKE :keyword OR account LIKE :keyword OR batchCode LIKE :keyword OR supplierName LIKE :keyword)");
    values.keyword = `%${keyword}%`;
  }
  for (const key of ["period", "confirmed", "collected", "collectionInvoice"] as const) {
    const value = text(params.get(key));
    if (value && value !== "all") {
      conditions.push(`${key} = :${key}`);
      values[key] = key === "confirmed" || key === "collected" ? (value === "true" || value === "1" ? 1 : 0) : value;
    }
  }
  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", values };
}

export async function listCloudRows(params: URLSearchParams) {
  const { page, pageSize, offset } = pageParams(params);
  const { where, values } = cloudWhere(params);
  const [count, rows, periodRows] = await Promise.all([
    queryRowsRaw<{ total: number }>(`SELECT COUNT(*) AS total FROM cloud_rows ${where}`, values),
    queryRowsRaw<Row>(`SELECT * FROM cloud_rows ${where} ORDER BY period DESC, updatedAt DESC LIMIT :limit OFFSET :offset`, { ...values, limit: pageSize, offset }),
    queryRowsRaw<{ period: string; rowCount: number; receivable: number; collected: number }>(
      `SELECT period, COUNT(*) AS rowCount, COALESCE(SUM(customerReceivable), 0) AS receivable,
              COALESCE(SUM(CASE WHEN collected = 1 THEN customerReceivable ELSE 0 END), 0) AS collected
         FROM cloud_rows GROUP BY period ORDER BY period DESC LIMIT 24`,
    ),
  ]);
  const summaryRows = await queryRowsRaw<{ receivable: number; collected: number; outstanding: number; overdueCount: number }>(
    `SELECT COALESCE(SUM(customerReceivable), 0) AS receivable,
            COALESCE(SUM(CASE WHEN collected = 1 THEN customerReceivable ELSE 0 END), 0) AS collected,
            COALESCE(SUM(CASE WHEN collected = 0 THEN customerReceivable ELSE 0 END), 0) AS outstanding,
            SUM(CASE WHEN collected = 0 AND paymentDate IS NOT NULL AND paymentDate < CURRENT_DATE THEN 1 ELSE 0 END) AS overdueCount
       FROM cloud_rows ${where}`,
    values,
  );
  return {
    items: rows,
    total: Number(count[0]?.total ?? 0),
    page,
    pageSize,
    summary: summaryRows[0] ?? { receivable: 0, collected: 0, outstanding: 0, overdueCount: 0 },
    periods: periodRows,
  };
}

export async function updateCloudRow(id: string, body: Row, actor: OperationActor | null) {
  const fields = CLOUD_ROW_COLUMNS.filter((key) => Object.prototype.hasOwnProperty.call(body, key));
  if (!fields.length) throw new Error("没有可保存的字段");
  const assignments = fields.map((key) => `${key} = :${key}`);
  const values: Row = { id };
  for (const key of fields) values[key] = body[key];
  if (actor) {
    assignments.push("updatedByUserId = :updatedByUserId", "updatedByName = :updatedByName");
    values.updatedByUserId = actor.userId;
    values.updatedByName = actor.displayName;
  }
  await executeRaw(`UPDATE cloud_rows SET ${assignments.join(", ")} WHERE id = :id`, values);
  return (await queryRowsRaw<Row>("SELECT * FROM cloud_rows WHERE id = :id", { id }))[0] ?? null;
}

export async function confirmCloudRow(id: string, confirmed: boolean, actor: OperationActor | null) {
  await executeRaw(
    `UPDATE cloud_rows SET confirmed = :confirmed, confirmedAt = CASE WHEN :confirmed = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
       confirmedByUserId = CASE WHEN :confirmed = 1 THEN :userId ELSE NULL END,
       confirmedByName = CASE WHEN :confirmed = 1 THEN :userName ELSE NULL END WHERE id = :id`,
    { id, confirmed: confirmed ? 1 : 0, userId: actor?.userId ?? null, userName: actor?.displayName ?? null },
  );
  return (await queryRowsRaw<Row>("SELECT * FROM cloud_rows WHERE id = :id", { id }))[0] ?? null;
}

export async function listCloudMappings(params: URLSearchParams) {
  const { page, pageSize, offset } = pageParams(params);
  const keyword = text(params.get("keyword"));
  const where = keyword ? "WHERE supplierName LIKE :keyword OR undertakingUnitName LIKE :keyword OR customerName LIKE :keyword OR reconciler LIKE :keyword" : "";
  const values = keyword ? { keyword: `%${keyword}%` } : {};
  const [count, rows] = await Promise.all([
    queryRowsRaw<{ total: number }>(`SELECT COUNT(*) AS total FROM cloud_mappings ${where}`, values),
    queryRowsRaw<Row>(`SELECT m.*, GROUP_CONCAT(a.account ORDER BY a.account SEPARATOR ', ') AS accounts
      FROM cloud_mappings m LEFT JOIN cloud_mapping_accounts a ON a.mappingId = m.id
      ${where} GROUP BY m.id ORDER BY m.updatedAt DESC LIMIT :limit OFFSET :offset`, { ...values, limit: pageSize, offset }),
  ]);
  return { items: rows, total: Number(count[0]?.total ?? 0), page, pageSize };
}

export async function saveCloudMapping(body: Row, id: string | null, actor: OperationActor | null) {
  const mappingId = id || randomUUID();
  const values = {
    id: mappingId,
    supplierId: text(body.supplierId), supplierName: text(body.supplierName), undertakingUnitId: text(body.undertakingUnitId),
    undertakingUnitName: text(body.undertakingUnitName), customerId: text(body.customerId), customerName: text(body.customerName),
    reconciler: text(body.reconciler), calculationLogic: text(body.calculationLogic) || "catalog",
    customCalculationLogic: text(body.customCalculationLogic) || null, userDiscount: body.userDiscount ?? null, remark: text(body.remark) || null,
    createdByUserId: actor?.userId ?? null, createdByName: actor?.displayName ?? null,
    updatedByUserId: actor?.userId ?? null, updatedByName: actor?.displayName ?? null,
  };
  if (id) {
    await executeRaw(`UPDATE cloud_mappings SET supplierId=:supplierId, supplierName=:supplierName, undertakingUnitId=:undertakingUnitId,
      undertakingUnitName=:undertakingUnitName, customerId=:customerId, customerName=:customerName, reconciler=:reconciler,
      calculationLogic=:calculationLogic, customCalculationLogic=:customCalculationLogic, userDiscount=:userDiscount, remark=:remark,
      updatedByUserId=:updatedByUserId, updatedByName=:updatedByName WHERE id=:id`, values);
  } else {
    await executeRaw(`INSERT INTO cloud_mappings
      (id,supplierId,supplierName,undertakingUnitId,undertakingUnitName,customerId,customerName,reconciler,calculationLogic,customCalculationLogic,userDiscount,remark,createdByUserId,createdByName,updatedByUserId,updatedByName)
      VALUES (:id,:supplierId,:supplierName,:undertakingUnitId,:undertakingUnitName,:customerId,:customerName,:reconciler,:calculationLogic,:customCalculationLogic,:userDiscount,:remark,:createdByUserId,:createdByName,:updatedByUserId,:updatedByName)`, values);
  }
  await executeRaw("DELETE FROM cloud_mapping_accounts WHERE mappingId = :mappingId", { mappingId });
  const accounts = Array.isArray(body.accounts) ? body.accounts.map(text).filter(Boolean) : text(body.accounts).split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  for (const account of accounts) await executeRaw("INSERT IGNORE INTO cloud_mapping_accounts (id,mappingId,account) VALUES (:id,:mappingId,:account)", { id: randomUUID(), mappingId, account });
  return (await queryRowsRaw<Row>("SELECT * FROM cloud_mappings WHERE id = :id", { id: mappingId }))[0] ?? null;
}

export async function deleteCloudMapping(id: string) {
  await executeRaw("DELETE FROM cloud_mapping_accounts WHERE mappingId = :id", { id });
  await executeRaw("DELETE FROM cloud_mappings WHERE id = :id", { id });
}

export async function cloudMasterData(keyword = "") {
  const like = `%${keyword}%`;
  const [suppliers, undertakingUnits, customers] = await Promise.all([
    queryRowsRaw<Row>("SELECT supplierId AS id, supplierCode AS code, nameCn AS name FROM common_suppliers WHERE status='active' AND (supplierCode LIKE :like OR nameCn LIKE :like) ORDER BY nameCn LIMIT 100", { like }),
    queryRowsRaw<Row>("SELECT undertakingUnitId AS id, undertakingUnitCode AS code, name FROM common_undertaking_units WHERE status='active' AND (undertakingUnitCode LIKE :like OR name LIKE :like) ORDER BY name LIMIT 100", { like }),
    queryRowsRaw<Row>("SELECT customerId AS id, customerCode AS code, name FROM common_customers WHERE status='active' AND (customerCode LIKE :like OR name LIKE :like) ORDER BY name LIMIT 100", { like }),
  ]);
  return { suppliers, undertakingUnits, customers };
}

export async function listCloudSupplierPayments(params: URLSearchParams) {
  const { page, pageSize, offset } = pageParams(params);
  const keyword = text(params.get("keyword"));
  const period = text(params.get("period"));
  const conditions = ["1=1"];
  const values: Row = { limit: pageSize, offset };
  if (keyword) { conditions.push("supplierName LIKE :keyword"); values.keyword = `%${keyword}%`; }
  if (period) { conditions.push("period = :period"); values.period = period; }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const [count, rows] = await Promise.all([
    queryRowsRaw<{ total: number }>(`SELECT COUNT(*) AS total FROM cloud_supplier_payments ${where}`, values),
    queryRowsRaw<Row>(`SELECT * FROM cloud_supplier_payments ${where} ORDER BY period DESC, supplierName ASC LIMIT :limit OFFSET :offset`, values),
  ]);
  return { items: rows, total: Number(count[0]?.total ?? 0), page, pageSize };
}

export async function updateCloudSupplierPayment(id: string, body: Row, actor: OperationActor | null) {
  const allowed = ["payerUnitId", "payerUnitName", "currency", "paymentExchangeRate", "paymentNetAmount", "paymentTaxRate", "paymentTaxAmount", "paymentTotalAmount", "paymentDate", "invoiceStatus", "paid"];
  const fields = allowed.filter((key) => Object.prototype.hasOwnProperty.call(body, key));
  if (!fields.length) throw new Error("没有可保存的付款字段");
  const values: Row = { id };
  const assignments = fields.map((key) => `${key} = :${key}`);
  for (const key of fields) values[key] = body[key];
  if (actor) { assignments.push("updatedByUserId = :userId", "updatedByName = :userName"); values.userId = actor.userId; values.userName = actor.displayName; }
  await executeRaw(`UPDATE cloud_supplier_payments SET ${assignments.join(", ")} WHERE id = :id`, values);
  return (await queryRowsRaw<Row>("SELECT * FROM cloud_supplier_payments WHERE id = :id", { id }))[0] ?? null;
}

export async function importCloudWorkbook(buffer: Buffer, fileName: string, period: string, actor: OperationActor | null) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("工作簿没有可导入的工作表");
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!raw.length) throw new Error("工作表没有数据");
  const normalized = raw
    .map((source) => Object.fromEntries(Object.entries(source).map(([key, value]) => [CLOUD_IMPORT_HEADERS[key.toLowerCase().replace(/\s+/g, "")] ?? CLOUD_IMPORT_HEADERS[key] ?? key, value])))
    .filter((source) => !isCloudImportNoteRow(source));
  if (!normalized.length) throw new Error("工作表没有可导入的账单数据");
  const invalidRow = normalized.findIndex((source) => !text(source.customer) || !text(source.account));
  if (invalidRow >= 0) {
    throw new Error(`第 ${invalidRow + 2} 行客户和账号不能为空`);
  }
  const resolvedPeriod = period || text(normalized[0]?.period) || new Date().toISOString().slice(0, 7);
  const batchId = randomUUID();
  const batchCode = `HC-${resolvedPeriod.replace(/[^0-9]/g, "")}-${Date.now().toString().slice(-6)}`;
  await executeRaw(`INSERT INTO cloud_import_batches (id,batchCode,period,fileName,rowCount,importedByUserId,importedByName) VALUES (:id,:batchCode,:period,:fileName,:rowCount,:userId,:userName)`, { id: batchId, batchCode, period: resolvedPeriod, fileName, rowCount: normalized.length, userId: actor?.userId ?? null, userName: actor?.displayName ?? null });
  for (const source of normalized) {
    const row: Row = { id: randomUUID(), importBatchId: batchId, period: text(source.period) || resolvedPeriod, batchCode, customer: text(source.customer), account: text(source.account), owner: text(source.owner), collectionEntity: text(source.collectionEntity), catalogAmount: number(source.catalogAmount), partnerAmount: number(source.partnerAmount), supplierPayable: number(source.supplierPayable), supplierTaxRate: number(source.supplierTaxRate), customerReceivable: number(source.customerReceivable), customerTaxRate: number(source.customerTaxRate), grossProfit: number(source.grossProfit), calculationLogic: text(source.calculationLogic), customerDiscount: number(source.customerDiscount), remark: text(source.remark), createdByUserId: actor?.userId ?? null, createdByName: actor?.displayName ?? null, updatedByUserId: actor?.userId ?? null, updatedByName: actor?.displayName ?? null };
    await executeRaw(`INSERT INTO cloud_rows (id,importBatchId,period,batchCode,customer,account,owner,collectionEntity,catalogAmount,partnerAmount,supplierPayable,supplierTaxRate,customerReceivable,customerTaxRate,grossProfit,calculationLogic,customerDiscount,remark,createdByUserId,createdByName,updatedByUserId,updatedByName)
      VALUES (:id,:importBatchId,:period,:batchCode,:customer,:account,:owner,:collectionEntity,:catalogAmount,:partnerAmount,:supplierPayable,:supplierTaxRate,:customerReceivable,:customerTaxRate,:grossProfit,:calculationLogic,:customerDiscount,:remark,:createdByUserId,:createdByName,:updatedByUserId,:updatedByName)`, row);
  }
  return { batchId, batchCode, period: resolvedPeriod, rowCount: normalized.length };
}

function isCloudImportNoteRow(row: Record<string, unknown>) {
  const values = Object.values(row).map(text).filter(Boolean);
  if (!values.length) return true;
  return values.every((value) => value === "必填" || value === "可选" || value.startsWith("必填：") || value.startsWith("可选："));
}

export async function listCloudAttachments(ownerType: string, ownerId: string) {
  return queryRowsRaw<Row>("SELECT id,ownerType,ownerId,fileName,fileType,fileSize,uploadedByName,uploadedAt FROM cloud_attachments WHERE ownerType = :ownerType AND ownerId = :ownerId ORDER BY uploadedAt DESC", { ownerType, ownerId });
}

export async function addCloudAttachment(ownerType: string, ownerId: string, file: { fileName: string; fileType: string; fileSize: number; dataUrl: string }, actor: OperationActor | null) {
  const id = randomUUID();
  await executeRaw(`INSERT INTO cloud_attachments (id,ownerType,ownerId,fileName,fileType,fileSize,dataUrl,uploadedByUserId,uploadedByName)
    VALUES (:id,:ownerType,:ownerId,:fileName,:fileType,:fileSize,:dataUrl,:userId,:userName)`, { id, ownerType, ownerId, ...file, userId: actor?.userId ?? null, userName: actor?.displayName ?? null });
  return (await queryRowsRaw<Row>("SELECT id,ownerType,ownerId,fileName,fileType,fileSize,uploadedByName,uploadedAt FROM cloud_attachments WHERE id = :id", { id }))[0] ?? null;
}

export async function findCloudAttachment(id: string) {
  return (await queryRowsRaw<Row>("SELECT * FROM cloud_attachments WHERE id = :id", { id }))[0] ?? null;
}

export async function deleteCloudAttachment(id: string) {
  await executeRaw("DELETE FROM cloud_attachments WHERE id = :id", { id });
}
