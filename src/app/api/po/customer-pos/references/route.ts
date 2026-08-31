import { NextRequest, NextResponse } from "next/server";
import { queryRows, type Row } from "@/lib/db";

type PartyKind = "customers" | "undertaking-units";

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") as PartyKind | null;
  const keyword = request.nextUrl.searchParams.get("keyword")?.trim() ?? "";
  if (kind !== "customers" && kind !== "undertaking-units") {
    return NextResponse.json({ error: "不支持的伙伴类型" }, { status: 400 });
  }

  const isCustomer = kind === "customers";
  const table = isCustomer ? "common_customers" : "common_undertaking_units";
  const id = isCustomer ? "customerId" : "undertakingUnitId";
  const code = isCustomer ? "customerCode" : "undertakingUnitCode";
  const fullName = isCustomer ? "nameCn" : "entityName";
  const fallbackName = "name";
  const keywordFields = isCustomer
    ? `${id}, ${code}, shortName, ${fullName}, ${fallbackName}, nameEn`
    : `${id}, ${code}, entityCode, shortName, ${fullName}, ${fallbackName}, nameEn`;
  const where = keyword
    ? `AND CONCAT_WS(' ', ${keywordFields}) LIKE :keyword`
    : "";
  const rows = await queryRows<Row>(
    `SELECT ${id} AS id, ${code} AS code, shortName, ${fullName} AS fullName, ${fallbackName} AS fallbackName
       FROM ${table}
      WHERE status = 'active' ${where}
      ORDER BY ${code}, ${id}
      LIMIT 100`,
    keyword ? { keyword: `%${keyword}%` } : {},
  );
  return NextResponse.json({
    options: rows.map((row) => {
      const optionCode = String(row.code ?? row.id ?? "").trim();
      const shortName = String(row.shortName ?? row.fullName ?? row.fallbackName ?? optionCode).trim();
      return { value: String(row.id ?? ""), code: optionCode, shortName, label: `${optionCode} - ${shortName}` };
    }),
  });
}
