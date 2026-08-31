import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { quotationItemImportFields } from "@/lib/quotation-item-spreadsheet";

export async function GET() {
  const headers = Object.fromEntries(quotationItemImportFields.map((field) => [field.label, ""]));
  const notes = Object.fromEntries(quotationItemImportFields.map((field) => [field.label, field.note]));
  const worksheet = XLSX.utils.json_to_sheet([headers, notes]);
  worksheet["!cols"] = quotationItemImportFields.map((field) => ({ wch: Math.max(18, field.label.length + 8) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "报价明细");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=quotation-items-template.xlsx",
    },
  });
}
