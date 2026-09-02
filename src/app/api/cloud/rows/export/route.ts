import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { queryRowsRaw } from "@/lib/db";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const keyword = params.get("keyword")?.trim() ?? "";
  const period = params.get("period")?.trim() ?? "";
  const conditions: string[] = [];
  const values: Record<string, unknown> = {};
  if (keyword) { conditions.push("(customer LIKE :keyword OR account LIKE :keyword OR batchCode LIKE :keyword OR supplierName LIKE :keyword)"); values.keyword = `%${keyword}%`; }
  if (period) { conditions.push("period = :period"); values.period = period; }
  const rows = await queryRowsRaw<Record<string, unknown>>(`SELECT * FROM merge_cloud_rows ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY period DESC, updatedAt DESC`, values);
  const worksheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
    "账期": row.period, "客户名称": row.customer, "华为ID": row.account, "华为对账人": row.cloudReconciler,
    "目录价（USD）": row.catalogAmount, "伙伴结算金额（USD）": row.partnerAmount, "代金券-客户（USD）": row.voucherCustomerAmount, "代金券-供应商（USD）": row.voucherSupplierAmount,
    "承接单位→供应商": `${row.supplierPayablePayer ?? "承接单位"} → ${row.supplierPayablePayee ?? "供应商"}`,
    "供应商应付（不含税）": row.supplierPayableNetAmount ?? row.supplierPayable, "供应商税率": row.supplierTaxRate, "供应商税金": row.supplierTaxAmount,
    "供应商应付（含税）": row.supplierPayableTotalAmount,
    "客户→承接单位": `${row.customerReceivablePayer ?? row.customer} → ${row.customerReceivablePayee ?? "承接单位"}`,
    "客户应收（不含税）": row.customerReceivableNetAmount ?? row.customerReceivable, "客户承担税率": row.customerTaxRate, "客户税金": row.customerReceivableTaxAmount,
    "客户应收（含税）": row.customerReceivableTotalAmount, "万众理论毛利（USD）": row.theoreticalGrossProfit, "万众结算毛利（USD）": row.settlementGrossProfit ?? row.grossProfit,
    "客户折扣": row.customerDiscount, "客户实收-付款单位": row.collectionPayer, "客户实收-收款单位": row.collectionPayee, "客户实收币种": row.collectionCurrency, "客户实收汇率": row.collectionExchangeRate,
    "客户实收未税金额": row.collectionNetAmount, "客户实收税率": row.collectionTaxRate, "客户实收税金": row.collectionTaxAmount, "客户实收含税金额": row.collectionTotalAmount,
    "应收日期": row.receivableDate,
    "客户开票号": row.invoiceNo, "客户开票币种": row.invoiceCurrency, "客户开票-付款单位": row.invoicePayer, "客户开票-收款单位": row.invoicePayee,
    "客户开票未税金额": row.invoiceNetAmount, "客户开票税率": row.invoiceTaxRate, "客户开票税金": row.invoiceTaxAmount, "客户开票含税金额": row.invoiceTotalAmount, "客户开票汇率": row.invoiceExchangeRate,
    "客户开票日期": row.invoiceDate, "客户开票状态": row.collectionInvoice === "issued" ? "已开票" : "未开票", "已收款": row.collected ? "是" : "否", "已确认": row.confirmed ? "是" : "否", "备注": row.remark,
  })));
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "华为云对账");
  return new NextResponse(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=cloud-reconciliation.xlsx" } });
}
