import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { normalizeEntityImportRow } from "@/lib/entity-import";
import { getEntityConfig } from "@/lib/modules";

const aliases: Record<string, string> = {
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

type Failure = { rowNumber: number; error: string };

export async function POST(request: NextRequest) {
  const config = getEntityConfig("customer-po-items");
  if (!config) return NextResponse.json({ error: "客户PO明细配置不存在" }, { status: 500 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择要导入的Excel文件" }, { status: 400 });
  if (!/\.xlsx?$/i.test(file.name)) return NextResponse.json({ error: "仅支持xlsx或xls文件" }, { status: 400 });

  try {
    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { cellDates: true });
    const sheetName = workbook.SheetNames.includes("产品明细") ? "产品明细" : workbook.SheetNames[0];
    if (!sheetName || !workbook.Sheets[sheetName]) return NextResponse.json({ error: "工作簿没有可导入的工作表" }, { status: 400 });
    const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "", raw: false })
      .filter((row) => Object.values(row).some((value) => String(value ?? "").trim()))
      .filter((row) => !isTemplateNoteRow(row));
    const allowedKeys = new Set(config.formFields.map((field) => field.key));
    const rows: Record<string, unknown>[] = [];
    const failed: Failure[] = [];
    for (const [index, source] of sourceRows.entries()) {
      const mapped = Object.fromEntries(
        Object.entries(source)
          .map(([label, value]) => [aliases[label] ?? label, value])
          .filter(([key]) => allowedKeys.has(String(key))),
      );
      const row = normalizeEntityImportRow(config, mapped);
      const quantity = Number(row.quantity ?? 0);
      const error = !String(row.customerProductName ?? "").trim()
        ? "产品名称不能为空"
        : !String(row.customerBrand ?? "").trim()
          ? "品牌不能为空"
          : !String(row.customerSpec ?? "").trim()
            ? "规格不能为空"
        : !Number.isFinite(quantity) || quantity <= 0
          ? "数量必须是大于0的数字"
          : "";
      if (error) {
        failed.push({ rowNumber: index + 2, error });
        continue;
      }
      rows.push({
        customerSku: row.customerSku ?? null,
        customerProductName: row.customerProductName,
        customerBrand: row.customerBrand ?? null,
        customerSpec: row.customerSpec ?? null,
        quantity,
        unit: row.unit ?? null,
        targetUnitPrice: row.targetUnitPrice ?? null,
        currency: row.currency ?? null,
        matchedProductCode: row.matchedProductCode ?? null,
        productMasterId: null,
        productModelId: null,
        productSpecId: null,
        matchStatus: row.matchedProductCode ? "unmatched" : "unmatched",
        remark: row.remark ?? null,
      });
    }
    return NextResponse.json({ total: sourceRows.length, success: rows.length, failed, rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "产品明细导入失败" }, { status: 400 });
  }
}

function isTemplateNoteRow(row: Record<string, unknown>) {
  const values = Object.values(row).map((value) => String(value ?? "").trim()).filter(Boolean);
  return values.length > 0 && values.every((value) => value === "必填" || value === "可选" || value.startsWith("必填：") || value.startsWith("可选："));
}
