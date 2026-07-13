import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getImportTarget, type ImportTargetKey } from "@/lib/import-center";

export async function GET(request: NextRequest) {
  const targetKey = request.nextUrl.searchParams.get("target") as ImportTargetKey | null;
  const target = targetKey ? getImportTarget(targetKey) : null;
  if (!target) {
    return NextResponse.json({ error: "未知导入类型" }, { status: 404 });
  }

  const headers = Object.fromEntries(target.columns.map((column) => [column.label, ""]));
  const notes = Object.fromEntries(target.columns.map((column) => [column.label, column.note ?? (column.required ? "必填" : "")]));
  const worksheet = XLSX.utils.json_to_sheet([headers, notes], { skipHeader: false });
  worksheet["!cols"] = target.columns.map((column) => ({ wch: Math.max(14, column.label.length + 8) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, target.title.slice(0, 31));
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${target.key}-template.xlsx"`,
    },
  });
}
