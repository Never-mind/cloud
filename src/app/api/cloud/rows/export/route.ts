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
  const rows = await queryRowsRaw<Record<string, unknown>>(`SELECT period,batchCode,customer,account,supplierName,customerReceivable,grossProfit,collectionInvoice,collected,confirmed,createdAt FROM cloud_rows ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY period DESC, updatedAt DESC`, values);
  const worksheet = XLSX.utils.json_to_sheet(rows.map((row) => ({ "账期": row.period, "批次号": row.batchCode, "客户": row.customer, "华为云账号": row.account, "供应商": row.supplierName, "客户应收": row.customerReceivable, "毛利": row.grossProfit, "收款发票": row.collectionInvoice, "已收款": row.collected ? "是" : "否", "已确认": row.confirmed ? "是" : "否", "创建时间": row.createdAt })));
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "华为云对账");
  return new NextResponse(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=cloud-reconciliation.xlsx" } });
}
