import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

const columns = [
  { label: "期间", note: "可选：YYYY-MM" },
  { label: "批次号", note: "可选" },
  { label: "客户", note: "必填" },
  { label: "账号", note: "必填" },
  { label: "所有者", note: "可选" },
  { label: "收款主体", note: "可选" },
  { label: "目录价", note: "可选：数字" },
  { label: "伙伴金额", note: "可选：数字" },
  { label: "供应商应付", note: "可选：数字" },
  { label: "供应商税率", note: "可选：数字" },
  { label: "客户应收", note: "可选：数字" },
  { label: "客户税率", note: "可选：数字" },
  { label: "毛利", note: "可选：数字" },
  { label: "计算逻辑", note: "可选" },
  { label: "客户折扣", note: "可选：数字" },
  { label: "备注", note: "可选" },
];

export async function GET() {
  const headers = Object.fromEntries(columns.map((column) => [column.label, ""]));
  const notes = Object.fromEntries(columns.map((column) => [column.label, column.note]));
  const worksheet = XLSX.utils.json_to_sheet([headers, notes], { skipHeader: false });
  worksheet["!cols"] = columns.map((column) => ({ wch: Math.max(14, column.label.length + 8) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "华为云账单");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="cloud-reconciliation-template.xlsx"',
    },
  });
}
