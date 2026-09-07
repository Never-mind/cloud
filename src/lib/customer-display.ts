import type { Row } from "./db";

const CUSTOMER_DISPLAY_COLUMNS = ["shortName", "nameCn", "name", "customerCode"] as const;

export function customerDisplayName(row: Row | undefined, fallback = "") {
  for (const column of CUSTOMER_DISPLAY_COLUMNS) {
    const value = String(row?.[column] ?? "").trim();
    if (value) return value;
  }
  return fallback;
}

export function customerDisplaySql(alias: string, ...fallbackExpressions: string[]) {
  const expressions = [
    `NULLIF(${alias}.shortName, '')`,
    `NULLIF(${alias}.nameCn, '')`,
    `NULLIF(${alias}.name, '')`,
    `NULLIF(${alias}.customerCode, '')`,
    ...fallbackExpressions.map((expression) => `NULLIF(${expression}, '')`),
  ];
  return `COALESCE(${expressions.join(", ")})`;
}
