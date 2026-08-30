import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

const columns = [
  { label: "账期", note: "必填：YYYY-MM" },
  { label: "批次号", note: "可选" },
  { label: "客户名称", note: "必填" },
  { label: "华为ID", note: "必填；一个ID一行" },
  { label: "华为对账人", note: "可选" },
  { label: "目录价（USD）", note: "可选：数字" },
  { label: "伙伴结算金额（USD）", note: "可选：数字" },
  { label: "代金券-客户（USD）", note: "可选：数字" },
  { label: "代金券-供应商（USD）", note: "可选：数字" },
  { label: "承接单位→供应商", note: "可选" },
  { label: "供应商应付（不含税）", note: "可选：数字" },
  { label: "供应商税率", note: "可选：数字，默认16%" },
  { label: "供应商税金", note: "可选：数字" },
  { label: "供应商应付（含税）", note: "可选：数字" },
  { label: "客户→承接单位", note: "可选" },
  { label: "客户应收（不含税）", note: "可选：数字" },
  { label: "客户承担税率", note: "可选：数字" },
  { label: "客户税金", note: "可选：数字" },
  { label: "客户应收（含税）", note: "可选：数字" },
  { label: "万众理论毛利（USD）", note: "可选：数字" },
  { label: "万众结算毛利（USD）", note: "可选：数字" },
  { label: "客户折扣", note: "可选：数字" },
  { label: "客户实收-收款单位", note: "可选" },
  { label: "客户实收-付款单位", note: "可选" },
  { label: "客户实收币种", note: "可选" },
  { label: "客户实收汇率", note: "可选：数字" },
  { label: "客户实收未税金额", note: "可选：数字" },
  { label: "客户实收税率", note: "可选：数字" },
  { label: "客户实收税金", note: "可选：数字" },
  { label: "客户实收含税金额", note: "可选：数字" },
  { label: "客户开票号", note: "可选" },
  { label: "客户开票币种", note: "可选" },
  { label: "客户开票-收款单位", note: "可选" },
  { label: "客户开票-付款单位", note: "可选" },
  { label: "客户开票未税金额", note: "可选：数字" },
  { label: "客户开票税率", note: "可选：数字" },
  { label: "客户开票税金", note: "可选：数字" },
  { label: "客户开票含税金额", note: "可选：数字" },
  { label: "客户开票汇率", note: "可选：数字" },
  { label: "客户开票日期", note: "可选：YYYY-MM-DD" },
  { label: "计算逻辑", note: "可选" },
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
