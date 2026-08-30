import { NextRequest, NextResponse } from "next/server";
import { queryRows, type Row } from "@/lib/db";
import { findProductByCode } from "@/lib/po-product-service";

export async function GET(request: NextRequest) {
  const productCode = request.nextUrl.searchParams.get("productCode")?.trim() ?? "";
    if (!productCode) {
      const masterRows = await queryRows<Row>(
        `SELECT
           masterCode AS productCode,
           name AS productName,
           nameEn,
           specification,
           brand,
           category,
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
      const rows = masterRows.length ? masterRows : await queryRows<Row>(
        `SELECT
           specification.specProductCode AS productCode,
           specification.specName,
           COALESCE(NULLIF(specification.suggestedPurchaseUnitPrice, 0), NULLIF(model.suggestedPurchaseUnitPrice, 0), 0) AS suggestedPurchaseUnitPrice,
           model.brand,
           model.model,
           master.name AS productName,
           master.nameEn,
           master.category,
           master.unit
         FROM po_product_specifications specification
       INNER JOIN po_product_models model ON model.id = specification.modelId
       INNER JOIN po_product_masters master ON master.id = model.masterId
       WHERE specification.status = 'active'
         AND model.status = 'active'
         AND master.status = 'active'
       ORDER BY specification.specProductCode
       LIMIT 500`,
      );
    return NextResponse.json({ rows });
  }

  const product = await findProductByCode(productCode);
  if (!product) return NextResponse.json({ error: "未找到启用中的产品编码" }, { status: 404 });
  return NextResponse.json({ product });
}
