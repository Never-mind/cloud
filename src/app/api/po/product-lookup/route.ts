import { NextRequest, NextResponse } from "next/server";
import { queryRows, type Row } from "@/lib/db";
import { findProductByCode } from "@/lib/po-product-service";

export async function GET(request: NextRequest) {
  const productCode = request.nextUrl.searchParams.get("productCode")?.trim() ?? "";
  const keyword = request.nextUrl.searchParams.get("keyword")?.trim() ?? "";
  if (keyword) {
    const rows = await queryRows<Row>(
      `SELECT
         masterCode AS productCode,
         name AS productName,
         nameEn,
         specification,
         brand,
         category,
         tariffRate,
         needNom,
         unit,
         suggestedPurchaseUnitPrice,
         'CNY' AS purchaseCurrency,
         id AS productMasterId,
         NULL AS productModelId,
         NULL AS productSpecId
       FROM po_product_masters
      WHERE status = 'active'
        AND CONCAT_WS(' ', masterCode, name, nameEn, specification, brand, category) LIKE :keyword
      ORDER BY masterCode
      LIMIT 100`,
      { keyword: `%${keyword}%` },
    );
    return NextResponse.json({ rows });
  }
    if (!productCode) {
      const masterRows = await queryRows<Row>(
        `SELECT
           masterCode AS productCode,
           name AS productName,
           nameEn,
           specification,
           brand,
           category,
           tariffRate,
           needNom,
           unit,
           suggestedPurchaseUnitPrice,
           'CNY' AS purchaseCurrency,
           id AS productMasterId,
           NULL AS productModelId,
           NULL AS productSpecId
         FROM po_product_masters
        WHERE status = 'active'
        ORDER BY masterCode
        LIMIT 500`,
      );
    return NextResponse.json({ rows: masterRows });
  }

  const product = await findProductByCode(productCode);
  if (!product) return NextResponse.json({ error: "未找到启用中的产品编码" }, { status: 404 });
  return NextResponse.json({ product });
}
