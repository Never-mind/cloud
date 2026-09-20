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

const instructions = [
  ["字段", "是否必填", "填写说明", "示例"],
  ["国家", "必填", "国家代码", "MX"],
  ["批次号", "必填", "与月账单合同中的批次号一致", "MX-45"],
  ["需求单号", "选填", "用于定位实例", "eSHWC260111d0e8"],
  ["PO单号", "选填", "用于定位实例", "PO2026012302"],
  ["实例编码", "必填", "需能在该实例合同下匹配到月账单合同", "06113690"],
  ["机型", "选填", "仅用于核对，可为空", "XV755.0.0.6"],
  ["英文名称", "选填", "仅用于核对，可为空", "i2ZS01 Network Enhancement A1"],
  ["数量", "选填", "数字", "4"],
  ["币种", "必填", "USD / CNY / MXN 等", "USD"],
  ["生效月份", "必填", "支持 2026-01、2026-01-01、2026/1/1，Excel 日期格式同样可以", "2026-01"],
  ["调整后前24个月价", "必填", "数字，含税合同价", "50"],
  ["调整后后36个月价", "必填", "数字，含税合同价", "60"],
];

export async function GET() {
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  worksheet["!cols"] = headers.map((header) => ({ wch: Math.max(header.length * 2 + 2, 12) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "实例合同调整明细");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(instructions), "填写说明");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=billing-adjustment-items-template.xlsx",
    },
  });
}
