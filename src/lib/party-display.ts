import { queryRows, type Row } from "./db";

export async function attachPartyCodes<T extends Row>(rows: T[]): Promise<Array<T & { supplierCode: string; undertakingUnitCode: string }>> {
  const supplierIds = unique(rows.map((row) => row.supplierId));
  const undertakingUnitIds = unique(rows.map((row) => row.undertakingUnitId));
  const [suppliers, undertakingUnits] = await Promise.all([
    supplierIds.length ? queryRows<Row>("SELECT supplierId, supplierCode FROM suppliers WHERE supplierId IN (:supplierIds)", { supplierIds }) : [],
    undertakingUnitIds.length ? queryRows<Row>("SELECT undertakingUnitId, undertakingUnitCode FROM undertakingunits WHERE undertakingUnitId IN (:undertakingUnitIds)", { undertakingUnitIds }) : [],
  ]);
  const supplierCodeById = new Map(suppliers.map((row) => [String(row.supplierId), String(row.supplierCode ?? row.supplierId ?? "")]));
  const undertakingUnitCodeById = new Map(undertakingUnits.map((row) => [String(row.undertakingUnitId), String(row.undertakingUnitCode ?? row.undertakingUnitId ?? "")]));

  return rows.map((row) => ({
    ...row,
    supplierCode: supplierCodeById.get(String(row.supplierId ?? "")) ?? String(row.supplierId ?? ""),
    undertakingUnitCode: undertakingUnitCodeById.get(String(row.undertakingUnitId ?? "")) ?? String(row.undertakingUnitId ?? ""),
  }));
}

function unique(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}
