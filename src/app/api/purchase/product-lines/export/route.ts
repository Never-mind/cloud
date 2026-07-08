import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { queryRows } from "@/lib/db";
import {
  buildPurchaseProductLines,
  filterPurchaseProductLines,
  formatPurchaseProductLineForExport,
} from "@/lib/purchase-lines";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("keyword") ?? "";
  const [purchaseOrders, purchaseItems, requestItems, requests, instanceModels] = await Promise.all([
    queryRows("SELECT poNo, requestNo, status, currency FROM purchaseorders ORDER BY createdAt DESC"),
    queryRows("SELECT id, poNo, requestItemId, unitPrice FROM purchaseorderitems ORDER BY id"),
    queryRows("SELECT id, requestNo, deviceCode, quantity FROM requestitems ORDER BY id"),
    queryRows("SELECT requestNo, batchName FROM requests ORDER BY createdAt DESC"),
    queryRows("SELECT deviceCode, nameZh, nameEn FROM instancemodels ORDER BY deviceCode"),
  ]);
  const rows = filterPurchaseProductLines(
    buildPurchaseProductLines({
      confirmedOnly: true,
      purchaseOrders: purchaseOrders as any,
      purchaseItems: purchaseItems as any,
      requestItems: requestItems as any,
      requests: requests as any,
      instanceModels: instanceModels as any,
    }),
    keyword,
  );
  const worksheet = XLSX.utils.json_to_sheet(rows.map(formatPurchaseProductLineForExport));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "采购明细一览");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="purchase-product-lines-export.xlsx"`,
    },
  });
}
