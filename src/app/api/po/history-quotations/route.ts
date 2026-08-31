import { NextRequest, NextResponse } from "next/server";
import { queryRows } from "@/lib/db";

export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId")?.trim() ?? "";
  const productCode = request.nextUrl.searchParams.get("productCode")?.trim() ?? "";
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 20) || 20));

  if (!customerId || !productCode) {
    return NextResponse.json({ error: "customerId 和 productCode 不能为空" }, { status: 400 });
  }

  const rows = await queryRows(
    `SELECT id, quotationId, quotationDate, customerId, productCode, productName,
            productMasterId, productModelId, productSpecId, customerPrice, currency, remark
       FROM merge_po_history_quotations
      WHERE customerId = :customerId AND productCode = :productCode
      ORDER BY quotationDate DESC, createdAt DESC
      LIMIT :limit`,
    { customerId, productCode, limit },
  );
  return NextResponse.json({ rows, latest: rows[0] ?? null, exactMatch: true });
}
