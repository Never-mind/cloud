import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { formatPurchaseProductLineForExport } from "@/lib/purchase-lines";
import { listPurchaseProductLines } from "@/lib/product-lines-service";

export async function GET(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);
  params.set("export", "1");
  const { rows } = await listPurchaseProductLines(params);
  const worksheet = XLSX.utils.json_to_sheet(rows.map((row) => formatPurchaseProductLineForExport(row as any)));
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
