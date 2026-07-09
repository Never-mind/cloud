import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

const headers = [
  "国家",
  "批次号",
  "需求单号",
  "PO单号",
  "实例编码",
  "机型",
  "英文名称",
  "数量",
  "币种",
  "生效月份",
  "调整后前24个月价",
  "调整后后36个月价",
];

export async function GET() {
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "实例合同调整明细");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=billing-adjustment-items-template.xlsx",
    },
  });
}
