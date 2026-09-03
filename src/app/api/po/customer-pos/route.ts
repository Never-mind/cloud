import { NextRequest, NextResponse } from "next/server";
import { queryRows, type Row } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, normalizePageSize } from "@/lib/pagination";

const undertakingUnitNameExpression = `COALESCE(NULLIF(unit.shortName, ''), NULLIF(unit.entityName, ''), NULLIF(unit.name, ''), NULLIF(unit.undertakingUnitCode, ''), po.undertakingUnitId)`;
const customerNameExpression = `COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), NULLIF(customer.customerCode, ''), po.customerId)`;

const filterExpressions: Record<string, string> = {
  poNo: "po.poNo",
  projectName: "po.projectName",
  undertakingUnitName: undertakingUnitNameExpression,
  customerName: customerNameExpression,
  poDate: "po.poDate",
  deliveryDate: "po.deliveryDate",
  currency: "po.currency",
  status: "po.status",
  createdByName: "po.createdByName",
  updatedByName: "po.updatedByName",
  confirmedByName: "po.confirmedByName",
};

const sortExpressions: Record<string, string> = {
  poNo: "po.poNo",
  projectName: "po.projectName",
  undertakingUnitName: undertakingUnitNameExpression,
  customerName: customerNameExpression,
  poDate: "po.poDate",
  deliveryDate: "po.deliveryDate",
  currency: "po.currency",
  status: "po.status",
  createdAt: "po.createdAt",
  updatedAt: "po.updatedAt",
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const requestedPage = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = normalizePageSize(Number(params.get("pageSize") ?? DEFAULT_PAGE_SIZE));
  const keyword = params.get("keyword")?.trim() ?? "";
  const whereParts = ["1 = 1"];
  const queryParams: Row = {};

  if (keyword) {
    whereParts.push(`(
      po.poNo LIKE :keyword
      OR po.projectName LIKE :keyword
      OR po.undertakingUnitId LIKE :keyword
      OR po.customerId LIKE :keyword
      OR EXISTS (
        SELECT 1 FROM merge_common_undertaking_units keywordUnit
        WHERE (keywordUnit.undertakingUnitId = po.undertakingUnitId OR keywordUnit.undertakingUnitCode = po.undertakingUnitId OR keywordUnit.entityCode = po.undertakingUnitId)
          AND CONCAT_WS(' ', keywordUnit.undertakingUnitCode, keywordUnit.entityCode, keywordUnit.shortName, keywordUnit.entityName, keywordUnit.name) LIKE :keyword
      )
      OR EXISTS (
        SELECT 1 FROM merge_common_customers keywordCustomer
        WHERE (keywordCustomer.customerId = po.customerId OR keywordCustomer.customerCode = po.customerId)
          AND CONCAT_WS(' ', keywordCustomer.customerCode, keywordCustomer.shortName, keywordCustomer.nameCn, keywordCustomer.name, keywordCustomer.nameEn) LIKE :keyword
      )
    )`);
    queryParams.keyword = `%${keyword}%`;
  }

  const status = params.get("status")?.trim() ?? "";
  if (status) {
    whereParts.push("po.status = :status");
    queryParams.status = status;
  }

  for (const [field, expression] of Object.entries(filterExpressions)) {
    const values = Array.from(new Set(params.getAll(`filter.${field}`).map((value) => value.trim()).filter(Boolean)));
    if (!values.length) continue;
    const parameterName = `filter_${field}`;
    whereParts.push(`${expression} IN (:${parameterName})`);
    queryParams[parameterName] = values;
  }

  const where = `WHERE ${whereParts.join(" AND ")}`;
  const countRows = await queryRows<{ total: number }>(
    `SELECT COUNT(DISTINCT po.id) AS total
       FROM merge_po_customer_pos po
       LEFT JOIN merge_common_undertaking_units unit
         ON unit.undertakingUnitId = po.undertakingUnitId
         OR unit.undertakingUnitCode = po.undertakingUnitId
         OR unit.entityCode = po.undertakingUnitId
       LEFT JOIN merge_common_customers customer
         ON customer.customerId = po.customerId
         OR customer.customerCode = po.customerId
      ${where}`,
    queryParams,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const sortField = params.get("sortField")?.trim() ?? "";
  const sortOrder = params.get("sortOrder") === "asc" ? "ASC" : params.get("sortOrder") === "desc" ? "DESC" : "";
  const orderBy = sortExpressions[sortField] && sortOrder
    ? `ORDER BY ${sortExpressions[sortField]} ${sortOrder}, po.id ASC`
    : "ORDER BY po.updatedAt DESC, po.id ASC";

  const rows = await queryRows<Row>(
    `SELECT po.*,
            ${undertakingUnitNameExpression} AS undertakingUnitName,
            ${customerNameExpression} AS customerName
       FROM merge_po_customer_pos po
       LEFT JOIN merge_common_undertaking_units unit
         ON unit.undertakingUnitId = po.undertakingUnitId
         OR unit.undertakingUnitCode = po.undertakingUnitId
         OR unit.entityCode = po.undertakingUnitId
       LEFT JOIN merge_common_customers customer
         ON customer.customerId = po.customerId
         OR customer.customerCode = po.customerId
      ${where}
      ${orderBy}
      LIMIT :limit OFFSET :offset`,
    { ...queryParams, limit: pageSize, offset: (page - 1) * pageSize },
  );

  const statusCountRows = await queryRows<{ status: string; count: number }>(
    `SELECT status, COUNT(*) AS count
       FROM merge_po_customer_pos
      GROUP BY status`,
  );
  const statusCounts = Object.fromEntries(
    statusCountRows.map((row) => [String(row.status ?? ""), Number(row.count ?? 0)]),
  );

  return NextResponse.json({ rows, total, page, pageSize, totalPages, statusCounts });
}
