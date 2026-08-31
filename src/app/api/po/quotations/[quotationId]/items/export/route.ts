import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { queryRows, type Row } from "@/lib/db";
import {
  formatQuotationItemExportValue,
  quotationItemExportFields,
} from "@/lib/quotation-item-spreadsheet";

export async function GET(_request: NextRequest, context: { params: Promise<{ quotationId: string }> }) {
  const { quotationId } = await context.params;
  const quotations = await queryRows<Row>(
    `SELECT id, quotationNo
       FROM po_quotations
      WHERE id = :quotationId OR quotationNo = :quotationId
      LIMIT 1`,
    { quotationId: decodeURIComponent(quotationId) },
  );
  const quotation = quotations[0];
  if (!quotation) return NextResponse.json({ error: "报价单不存在" }, { status: 404 });

  const rows = await queryRows<Row>(
    `SELECT *
       FROM po_quotation_items
      WHERE quotationId = :quotationId
      ORDER BY lineNo ASC, id ASC`,
    { quotationId: quotation.id },
  );
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) => Object.fromEntries(
      quotationItemExportFields.map((field) => [field.label, formatQuotationItemExportValue(field.key, row[field.key])]),
    )),
  );
  worksheet["!cols"] = quotationItemExportFields.map((field) => ({ wch: Math.max(14, field.label.length + 6) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "报价明细");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const quotationNo = String(quotation.quotationNo ?? quotation.id).replace(/[^A-Za-z0-9_-]+/g, "-");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=quotation-items-${quotationNo || "export"}.xlsx`,
    },
  });
}
