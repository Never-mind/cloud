import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getOperationActor } from "@/lib/operation-actor";
import { queryRows, execute, type Row } from "@/lib/db";
import { recalculateQuotationSummary } from "@/lib/quotation-workflow";
import {
  isQuotationItemTemplateNoteRow,
  normalizeQuotationItemBoolean,
  normalizeQuotationItemTransport,
  parseQuotationItemNumber,
  quotationItemImportAliases,
} from "@/lib/quotation-item-spreadsheet";

type Failure = { rowNumber: number; primaryKey: string; error: string };

export async function POST(request: NextRequest, context: { params: Promise<{ quotationId: string }> }) {
  const { quotationId: rawQuotationId } = await context.params;
  const quotationId = decodeURIComponent(rawQuotationId);
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择要导入的Excel文件" }, { status: 400 });
  if (!/\.xlsx?$/i.test(file.name)) return NextResponse.json({ error: "仅支持xlsx或xls文件" }, { status: 400 });

  try {
    const quotations = await queryRows<Row>(
      `SELECT id, quotationNo, status
         FROM po_quotations
        WHERE id = :quotationId OR quotationNo = :quotationId
        LIMIT 1`,
      { quotationId },
    );
    const quotation = quotations[0];
    if (!quotation) return NextResponse.json({ error: "报价单不存在" }, { status: 404 });
    if (String(quotation.status ?? "") !== "draft") {
      return NextResponse.json({ error: "已确认的报价单不能导入明细" }, { status: 400 });
    }

    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { cellDates: true });
    const sheetName = workbook.SheetNames.includes("报价明细") ? "报价明细" : workbook.SheetNames[0];
    if (!sheetName || !workbook.Sheets[sheetName]) return NextResponse.json({ error: "工作簿没有可导入的工作表" }, { status: 400 });
    const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "", raw: false })
      .filter((row) => Object.values(row).some((value) => String(value ?? "").trim()))
      .filter((row) => !isQuotationItemTemplateNoteRow(row));
    if (!sourceRows.length) return NextResponse.json({ error: "导入文件没有有效数据" }, { status: 400 });

    const items = await queryRows<Row>(
      `SELECT id, lineNo, productCode, purchaseCurrency, purchaseUnitPrice, quantity,
              transportType, isCustomsClearance, enableNom, ddpQuoteUnitUsd, markupRate, remark
         FROM po_quotation_items
        WHERE quotationId = :quotationId
        ORDER BY lineNo ASC, id ASC`,
      { quotationId: quotation.id },
    );
    const actor = await getOperationActor(request);
    const byLineNo = new Map<number, Row>();
    const byProductCode = new Map<string, Row[]>();
    for (const item of items) {
      const lineNo = Number(item.lineNo ?? 0);
      if (Number.isFinite(lineNo) && lineNo > 0) byLineNo.set(lineNo, item);
      const code = String(item.productCode ?? "").trim();
      if (code) byProductCode.set(code, [...(byProductCode.get(code) ?? []), item]);
    }

    const failed: Failure[] = [];
    let success = 0;
    for (const [index, source] of sourceRows.entries()) {
      const mapped = mapImportRow(source);
      const lineNo = parseQuotationItemNumber(mapped.lineNo);
      const productCode = String(mapped.productCode ?? "").trim();
      const purchaseUnitPrice = parseQuotationItemNumber(mapped.purchaseUnitPrice);
      const ddpQuoteUnitUsd = parseQuotationItemNumber(mapped.ddpQuoteUnitUsd);
      const primaryKey = productCode || (lineNo === undefined ? "" : String(lineNo));
      try {
        if (lineNo === undefined && !productCode) throw new Error("行号和产品编码至少填写一个");
        if (purchaseUnitPrice === undefined && ddpQuoteUnitUsd === undefined) {
          throw new Error("原币不含税采购单价和手动DDP不含税单价至少填写一个");
        }
        if (purchaseUnitPrice !== undefined && purchaseUnitPrice < 0) throw new Error("原币不含税采购单价不能小于0");
        if (ddpQuoteUnitUsd !== undefined && ddpQuoteUnitUsd < 0) throw new Error("手动DDP不含税单价不能小于0");

        const byLine = lineNo === undefined ? undefined : byLineNo.get(lineNo);
        const codeMatches = productCode ? (byProductCode.get(productCode) ?? []) : [];
        if (byLine && productCode && String(byLine.productCode ?? "").trim() !== productCode) {
          throw new Error(`行号${lineNo}与产品编码不匹配`);
        }
        const target = byLine ?? (codeMatches.length === 1 ? codeMatches[0] : undefined);
        if (!target && codeMatches.length > 1) throw new Error("该产品编码对应多条明细，请填写行号");
        if (!target) throw new Error("未找到对应的报价明细");

        const quantity = parseQuotationItemNumber(mapped.quantity);
        if (quantity !== undefined && quantity <= 0) throw new Error("采购数量必须大于0");
        const transportType = mapped.transportType === undefined || String(mapped.transportType).trim() === ""
          ? undefined
          : normalizeQuotationItemTransport(mapped.transportType);
        if (mapped.transportType !== undefined && String(mapped.transportType).trim() && !transportType) {
          throw new Error("运输方式只能填写空运、海运或无运输");
        }
        const customsClearance = parseBooleanIfPresent(mapped.isCustomsClearance, "是否清关");
        const enableNom = parseBooleanIfPresent(mapped.enableNom, "是否需要NOM");
        const markupRate = parseQuotationItemNumber(mapped.markupRate);
        if (markupRate !== undefined && markupRate < -100) throw new Error("加价率不能小于-100%");

        await execute(
          `UPDATE po_quotation_items
              SET purchaseUnitPrice = :purchaseUnitPrice,
                  purchaseCurrency = :purchaseCurrency,
                  ddpQuoteUnitUsd = :ddpQuoteUnitUsd,
                  quantity = :quantity,
                  transportType = :transportType,
                  isCustomsClearance = :isCustomsClearance,
                  enableNom = :enableNom,
                  markupRate = :markupRate,
                  remark = :remark
            WHERE id = :id AND quotationId = :quotationId`,
          {
            id: target.id,
            quotationId: quotation.id,
            purchaseUnitPrice: purchaseUnitPrice ?? target.purchaseUnitPrice ?? 0,
            purchaseCurrency: String(mapped.purchaseCurrency ?? "").trim() || target.purchaseCurrency || "CNY",
            ddpQuoteUnitUsd: ddpQuoteUnitUsd ?? target.ddpQuoteUnitUsd ?? null,
            quantity: quantity ?? target.quantity ?? 0,
            transportType: transportType ?? target.transportType ?? "sea",
            isCustomsClearance: customsClearance ?? target.isCustomsClearance ?? 0,
            enableNom: enableNom ?? target.enableNom ?? 0,
            markupRate: markupRate ?? target.markupRate ?? 0,
            remark: mapped.remark === undefined || String(mapped.remark).trim() === "" ? target.remark ?? null : mapped.remark,
          },
        );
        success += 1;
      } catch (error) {
        failed.push({ rowNumber: index + 2, primaryKey, error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (success > 0) await recalculateQuotationSummary(String(quotation.id), actor);
    return NextResponse.json({ total: sourceRows.length, success, failed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "报价明细导入失败" }, { status: 400 });
  }
}

function mapImportRow(source: Record<string, unknown>) {
  const mapped: Row = {};
  for (const [label, value] of Object.entries(source)) {
    const key = quotationItemImportAliases[label] ?? label;
    if (value !== "" && value !== undefined && value !== null) mapped[key] = value;
  }
  return mapped;
}

function parseBooleanIfPresent(value: unknown, label: string) {
  if (value === undefined || String(value).trim() === "") return undefined;
  const parsed = normalizeQuotationItemBoolean(value);
  if (parsed === undefined) throw new Error(`${label}只能填写是或否`);
  return parsed ? 1 : 0;
}
