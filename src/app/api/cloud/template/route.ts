import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

const columns = [
  { label: "账期", note: "必填：YYYY-MM" },
  { label: "客户名称", note: "必填" },
  { label: "华为ID", note: "必填；一个ID一行" },
  { label: "目录价", note: "可选：数字" },
  { label: "伙伴结算金额", note: "可选：数字" },
  { label: "代金券-客户", note: "可选：数字" },
  { label: "代金券-万众", note: "可选：数字" },
  { label: "供应商应付金额（不含税）", note: "可选：数字" },
  { label: "供应商税率", note: "可选：数字，默认16%" },
  { label: "伙伴税金", note: "可选：数字" },
  { label: "伙伴应还金额（含税）", note: "可选：数字" },
  { label: "客户应还金额（不含税）", note: "可选：数字" },
  { label: "客户税率", note: "可选：数字" },
  { label: "客户应还金额（含税）", note: "可选：数字" },
  { label: "理论毛利", note: "可选：数字" },
  { label: "结算毛利", note: "可选：数字；留空时按 客户应还金额（不含税）− 供应商应付金额（不含税）自动计算" },
  { label: "特殊折扣", note: "可选：文本，如 伙伴85%，客户100%" },
  { label: "备注", note: "可选" },
];

export async function GET() {
  // 直接按二维数组生成：第 1 行表头、第 2 行填写说明。
  // 用 json_to_sheet([headers, notes]) 会多出一行空白（表头/空行/说明），既难看又容易让人误解。
  const worksheet = XLSX.utils.aoa_to_sheet([
    columns.map((column) => column.label),
    columns.map((column) => column.note),
  ]);
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
