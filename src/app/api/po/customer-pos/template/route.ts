import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getEntityConfig } from "@/lib/modules";

const masterKeys = ["poNo", "projectName", "undertakingUnitId", "customerId", "poDate", "deliveryDate", "currency", "status", "remark"];
const itemFields = [
  ["lineNo", "行号", "数字"],
  ["customerSku", "客户SKU", "文本"],
  ["customerProductName", "产品名称", "文本"],
  ["customerBrand", "品牌", "文本"],
  ["customerSpec", "规格", "文本"],
  ["quantity", "数量", "数字"],
  ["unit", "单位", "文本"],
  ["targetUnitPrice", "目标单价", "金额（两位小数）"],
  ["currency", "币种", "文本"],
  ["matchedProductCode", "产品主档匹配", "文本"],
  ["remark", "备注", "文本"],
] as const;

export async function GET() {
  const masterConfig = getEntityConfig("customer-pos");
  if (!masterConfig) return NextResponse.json({ error: "客户PO配置不存在" }, { status: 500 });
  const masterLabels: Record<string, string> = {
    poNo: "客户PO号",
    projectName: "项目名称",
    undertakingUnitId: "承接单位",
    customerId: "客户",
    poDate: "PO日期",
    deliveryDate: "交付日期",
    currency: "币种",
    status: "状态",
    remark: "备注",
  };
  const masterNotes: Record<string, string> = {
    poNo: "必填：文本",
    projectName: "可选：文本",
    undertakingUnitId: "必填：承接单位编码或简称",
    customerId: "必填：客户编码或简称",
    poDate: "必填：日期，例如2026-08-30",
    deliveryDate: "可选：日期",
    currency: "可选：文本，默认USD",
    status: "可选：draft或confirmed，默认draft",
    remark: "可选：文本",
  };
  const masterHeaders = Object.fromEntries(masterKeys.map((key) => [masterLabels[key], ""]));
  const masterNotesRow = Object.fromEntries(masterKeys.map((key) => [masterLabels[key], masterNotes[key]]));
  const itemHeaders = Object.fromEntries([["客户PO号", ""], ...itemFields.map(([, label]) => [label, ""])]);
  const itemNotesRow = Object.fromEntries([["客户PO号", "必填：对应客户PO号"], ...itemFields.map(([key, label, type]) => [label, ["customerProductName", "quantity", "lineNo"].includes(key) ? `必填：${type}` : `可选：${type}`])]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([masterHeaders, masterNotesRow]), "客户PO");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([itemHeaders, itemNotesRow]), "产品明细");
  for (const worksheet of Object.values(workbook.Sheets)) {
    worksheet["!cols"] = Object.keys(worksheet).filter((key) => !key.startsWith("!")).length
      ? Array.from({ length: 16 }, () => ({ wch: 18 }))
      : [];
  }
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=customer-pos-template.xlsx",
    },
  });
}
