import { NextRequest, NextResponse } from "next/server";
import { queryRows, type Row } from "@/lib/db";

const undertakingUnitNameExpression = `COALESCE(NULLIF(unit.shortName, ''), NULLIF(unit.entityName, ''), NULLIF(unit.name, ''), NULLIF(unit.undertakingUnitCode, ''), po.undertakingUnitId)`;
const customerNameExpression = `COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), NULLIF(customer.customerCode, ''), po.customerId)`;

export async function GET(_request: NextRequest, context: { params: Promise<{ poId: string }> }) {
  const { poId } = await context.params;
  const id = decodeURIComponent(poId);
  if (!id) return NextResponse.json({ error: "缺少客户PO ID" }, { status: 400 });

  const masters = await queryRows<Row>(
    `SELECT po.*,
            ${undertakingUnitNameExpression} AS undertakingUnitName,
            ${customerNameExpression} AS customerName
       FROM po_customer_pos po
       LEFT JOIN common_undertaking_units unit
         ON unit.undertakingUnitId = po.undertakingUnitId
         OR unit.undertakingUnitCode = po.undertakingUnitId
         OR unit.entityCode = po.undertakingUnitId
       LEFT JOIN common_customers customer
         ON customer.customerId = po.customerId
         OR customer.customerCode = po.customerId
      WHERE po.id = :id
      LIMIT 1`,
    { id },
  );
  const master = masters[0];
  if (!master) return NextResponse.json({ error: "客户PO不存在" }, { status: 404 });

  const items = await queryRows<Row>(
    `SELECT item.*,
            product.masterCode AS matchedProductMasterCode,
            product.name AS matchedProductName
       FROM po_customer_po_items item
       LEFT JOIN po_product_masters product ON product.id = item.productMasterId
      WHERE item.poId = :poId
      ORDER BY item.lineNo ASC, item.id ASC`,
    { poId: id },
  );
  return NextResponse.json({ master, items });
}
