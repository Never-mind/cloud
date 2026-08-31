import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createEntityRow, updateEntityRow } from "@/lib/crud";
import { findProductByCode } from "@/lib/po-product-service";
import { getEntityConfig } from "@/lib/modules";
import { getOperationActor, operationFields } from "@/lib/operation-actor";
import { normalizeEntityImportRow, validateEntityImportRow } from "@/lib/entity-import";
import { normalizePartyReferenceRow, type PartyReferenceCollections } from "@/lib/party-reference";
import { queryRows, type Row } from "@/lib/db";

type ImportFailure = { rowNumber: number; primaryKey: string; error: string };
type ImportReport = { total: number; success: number; failed: ImportFailure[] };

const masterAliases: Record<string, string> = {
  "客户PO号": "poNo",
  "PO号": "poNo",
  "项目名称": "projectName",
  "承接单位": "undertakingUnitId",
  "客户": "customerId",
  "客户编码": "customerId",
  "客户ID": "customerId",
};

const itemAliases: Record<string, string> = {
  "客户PO号": "poNo",
  "PO号": "poNo",
  "行号": "lineNo",
  "客户SKU": "customerSku",
  "产品名称": "customerProductName",
  "客户产品名称": "customerProductName",
  "品牌": "customerBrand",
  "客户品牌": "customerBrand",
  "规格": "customerSpec",
  "客户规格": "customerSpec",
  "数量": "quantity",
  "单位": "unit",
  "目标单价": "targetUnitPrice",
  "币种": "currency",
  "产品主档匹配": "matchedProductCode",
  "匹配产品编码": "matchedProductCode",
  "备注": "remark",
};

export async function POST(request: NextRequest) {
  const masterConfig = getEntityConfig("customer-pos");
  const itemConfig = getEntityConfig("customer-po-items");
  if (!masterConfig || !itemConfig) return NextResponse.json({ error: "客户PO配置不存在" }, { status: 500 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择要导入的Excel文件" }, { status: 400 });
  if (!/\.xlsx?$/i.test(file.name)) return NextResponse.json({ error: "仅支持xlsx或xls文件" }, { status: 400 });

  try {
    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { cellDates: true });
    const masterRows = readRows(workbook, "客户PO");
    const itemRows = readRows(workbook, "产品明细");
    if (!masterRows.length && !itemRows.length) {
      return NextResponse.json({ error: "工作簿中没有可导入的数据，请使用客户PO导入模板" }, { status: 400 });
    }

    const references = await loadPartyReferences();
    const actor = await getOperationActor(request);
    const masterIdsByPoNo = new Map<string, string>();
    const masterStatusByPoNo = new Map<string, string>();
    const masters = await importMasters(masterRows, masterConfig, references, actor, masterIdsByPoNo, masterStatusByPoNo);
    const items = await importItems(itemRows, itemConfig, masterIdsByPoNo, masterStatusByPoNo, actor);
    return NextResponse.json({ masters, items });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "客户PO导入失败" }, { status: 400 });
  }
}

function readRows(workbook: XLSX.WorkBook, preferredSheet: string) {
  const sheetName = workbook.SheetNames.includes(preferredSheet)
    ? preferredSheet
    : preferredSheet === "客户PO" ? workbook.SheetNames[0] : workbook.SheetNames[1];
  if (!sheetName) return [] as Record<string, unknown>[];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [] as Record<string, unknown>[];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: false })
    .filter((row) => Object.values(row).some((value) => String(value ?? "").trim()))
    .filter((row) => !isTemplateNoteRow(row));
}

function isTemplateNoteRow(row: Record<string, unknown>) {
  const values = Object.values(row).map((value) => String(value ?? "").trim()).filter(Boolean);
  return values.length > 0 && values.every((value) => value === "必填" || value === "可选" || value.startsWith("必填：") || value.startsWith("可选："));
}

function mapRow(row: Record<string, unknown>, aliases: Record<string, string>, allowedKeys: Set<string>) {
  return Object.fromEntries(
    Object.entries(row)
      .map(([label, value]) => [aliases[label] ?? label, value])
      .filter(([key]) => allowedKeys.has(String(key))),
  ) as Row;
}

async function importMasters(
  rows: Record<string, unknown>[],
  config: NonNullable<ReturnType<typeof getEntityConfig>>,
  references: PartyReferenceCollections,
  actor: Awaited<ReturnType<typeof getOperationActor>>,
  masterIdsByPoNo: Map<string, string>,
  masterStatusByPoNo: Map<string, string>,
): Promise<ImportReport> {
  const allowedKeys = new Set([...config.formFields.map((field) => field.key), "poNo"]);
  const report: ImportReport = { total: rows.length, success: 0, failed: [] };
  for (const [index, source] of rows.entries()) {
    const mapped = mapRow(source, masterAliases, allowedKeys);
    const row = normalizeEntityImportRow(config, mapped);
    row.status = row.status || "draft";
    row.currency = row.currency || "USD";
    const poNo = String(row.poNo ?? "").trim();
    try {
      const referenceError = normalizePartyReferenceRow(row, references);
      if (referenceError) throw new Error(referenceError);
      const validationError = validateEntityImportRow(config, row);
      if (validationError) throw new Error(validationError);
      const existingRows = await queryRows<Row>("SELECT id, status FROM po_customer_pos WHERE poNo = :poNo LIMIT 1", { poNo });
      const existing = existingRows[0];
      if (String(existing?.status ?? "") === "confirmed") throw new Error("已确认的客户PO不能通过导入修改");
      const id = String(existing?.id ?? row.id ?? randomUUID());
      const saved = existing
        ? await updateEntityRow(config, id, { ...row, id, ...operationFields(actor, "update") })
        : await createEntityRow(config, { ...row, id, ...operationFields(actor, "create") });
      const savedId = String(saved?.id ?? id);
      masterIdsByPoNo.set(poNo, savedId);
      masterStatusByPoNo.set(poNo, String(row.status ?? existing?.status ?? "draft"));
      report.success += 1;
    } catch (error) {
      report.failed.push({ rowNumber: index + 2, primaryKey: poNo, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}

async function importItems(
  rows: Record<string, unknown>[],
  config: NonNullable<ReturnType<typeof getEntityConfig>>,
  masterIdsByPoNo: Map<string, string>,
  masterStatusByPoNo: Map<string, string>,
  actor: Awaited<ReturnType<typeof getOperationActor>>,
): Promise<ImportReport> {
  const allowedKeys = new Set([...config.formFields.map((field) => field.key), "poNo"]);
  const report: ImportReport = { total: rows.length, success: 0, failed: [] };
  const poNos = Array.from(new Set(rows.map((row) => String(row[itemKey("客户PO号")] ?? row.poNo ?? "").trim()).filter(Boolean)));
  const existingMasters = poNos.length
    ? await queryRows<Row>("SELECT id, poNo, status FROM po_customer_pos WHERE poNo IN (:poNos)", { poNos })
    : [];
  for (const master of existingMasters) {
    const poNo = String(master.poNo ?? "");
    if (!masterIdsByPoNo.has(poNo)) masterIdsByPoNo.set(poNo, String(master.id));
    if (!masterStatusByPoNo.has(poNo)) masterStatusByPoNo.set(poNo, String(master.status ?? "draft"));
  }
  const poIds = Array.from(new Set(masterIdsByPoNo.values()));
  const existingItems = poIds.length
    ? await queryRows<Row>("SELECT id, poId, lineNo FROM po_customer_po_items WHERE poId IN (:poIds)", { poIds })
    : [];
  const itemByKey = new Map(existingItems.map((row) => [`${row.poId}:${row.lineNo}`, String(row.id)]));
  const codes = Array.from(new Set(rows.map((source) => String(mapRow(source, itemAliases, allowedKeys).matchedProductCode ?? "").trim()).filter(Boolean)));
  const products = new Map<string, Row>();
  for (const code of codes) {
    const product = await findProductByCode(code);
    if (product) products.set(code, product);
  }

  for (const [index, source] of rows.entries()) {
    const mapped = mapRow(source, itemAliases, allowedKeys);
    const poNo = String(mapped.poNo ?? "").trim();
    const row = normalizeEntityImportRow(config, mapped);
    const lineNo = Number(row.lineNo ?? 0);
    const poId = masterIdsByPoNo.get(poNo) ?? "";
    try {
      if (!poId) throw new Error(`未找到客户PO：${poNo || "空"}`);
      if (masterStatusByPoNo.get(poNo) === "confirmed") throw new Error("已确认的客户PO不能通过导入修改明细");
      if (!Number.isFinite(lineNo) || lineNo <= 0) throw new Error("行号必须是大于0的数字");
      if (!String(row.customerProductName ?? "").trim()) throw new Error("产品名称不能为空");
      if (!Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0) throw new Error("数量必须是大于0的数字");
      const code = String(row.matchedProductCode ?? "").trim();
      const product = products.get(code);
      const itemId = itemByKey.get(`${poId}:${lineNo}`) ?? String(row.id ?? randomUUID());
      const payload = {
        ...row,
        id: itemId,
        poId,
        currency: row.currency || "USD",
        productMasterId: product?.productMasterId ?? row.productMasterId ?? null,
        productModelId: product?.productModelId ?? row.productModelId ?? null,
        productSpecId: product?.productSpecId ?? row.productSpecId ?? null,
        matchStatus: product ? "matched" : code ? "unmatched" : "unmatched",
      };
      const existing = itemByKey.has(`${poId}:${lineNo}`);
      if (existing) await updateEntityRow(config, itemId, payload);
      else await createEntityRow(config, { ...payload, ...operationFields(actor, "create") });
      itemByKey.set(`${poId}:${lineNo}`, itemId);
      report.success += 1;
    } catch (error) {
      report.failed.push({ rowNumber: index + 2, primaryKey: poNo ? `${poNo}/${lineNo || "?"}` : "", error: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}

function itemKey(label: string) {
  return itemAliases[label] ?? label;
}

async function loadPartyReferences(): Promise<PartyReferenceCollections> {
  const [suppliers, undertakingUnits, customers] = await Promise.all([
    queryRows("SELECT supplierId, supplierCode, shortName, nameCn, name FROM common_suppliers"),
    queryRows("SELECT undertakingUnitId, undertakingUnitCode, entityCode, shortName, entityName, name FROM common_undertaking_units"),
    queryRows("SELECT customerId, customerCode, shortName, nameCn, name FROM common_customers"),
  ]);
  return { suppliers, undertakingUnits, customers };
}
