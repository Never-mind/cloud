import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

const fields = [
  ["行号", "必填：数字"],
  ["客户SKU", "可选：文本"],
  ["产品名称", "必填：文本"],
  ["品牌", "可选：文本"],
  ["规格", "可选：文本"],
  ["数量", "必填：大于0的数字"],
  ["单位", "可选：文本"],
  ["目标单价", "可选：金额"],
  ["币种", "可选：文本，未填写时使用PO币种"],
  ["产品主档匹配", "可选：产品主档编码"],
  ["备注", "可选：文本"],
] as const;

export async function GET() {
  const headers = Object.fromEntries(fields.map(([label]) => [label, ""]));
  const notes = Object.fromEntries(fields.map(([label, note]) => [label, note]));
  const worksheet = XLSX.utils.json_to_sheet([headers, notes]);
  worksheet["!cols"] = fields.map(() => ({ wch: 18 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "产品明细");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=customer-po-items-template.xlsx",
    },
  });
}
