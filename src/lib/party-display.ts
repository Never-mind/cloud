import { queryRows, type Row } from "./db";

export async function attachPartyCodes<T extends Row>(rows: T[]): Promise<Array<T & { supplierCode: string; undertakingUnitCode: string; customerCode: string }>> {
  const supplierIds = unique(rows.map((row) => row.supplierId));
  const undertakingUnitIds = unique(rows.map((row) => row.undertakingUnitId));
  const customerIds = unique(rows.map((row) => row.customerId));
  const [suppliers, undertakingUnits, customers] = await Promise.all([
    supplierIds.length ? queryRows<Row>("SELECT supplierId, supplierCode FROM suppliers WHERE supplierId IN (:supplierIds)", { supplierIds }) : [],
    undertakingUnitIds.length ? queryRows<Row>("SELECT undertakingUnitId, undertakingUnitCode FROM undertakingunits WHERE undertakingUnitId IN (:undertakingUnitIds)", { undertakingUnitIds }) : [],
    customerIds.length ? queryRows<Row>("SELECT customerId, customerCode FROM customers WHERE customerId IN (:customerIds)", { customerIds }) : [],
  ]);
  const supplierCodeById = new Map(suppliers.map((row) => [String(row.supplierId), String(row.supplierCode ?? row.supplierId ?? "")]));
  const undertakingUnitCodeById = new Map(undertakingUnits.map((row) => [String(row.undertakingUnitId), String(row.undertakingUnitCode ?? row.undertakingUnitId ?? "")]));
  const customerCodeById = new Map(customers.map((row) => [String(row.customerId), String(row.customerCode ?? row.customerId ?? "")]));

  return rows.map((row) => ({
    ...row,
    supplierCode: supplierCodeById.get(String(row.supplierId ?? "")) ?? String(row.supplierId ?? ""),
    undertakingUnitCode: undertakingUnitCodeById.get(String(row.undertakingUnitId ?? "")) ?? String(row.undertakingUnitId ?? ""),
    customerCode: customerCodeById.get(String(row.customerId ?? "")) ?? String(row.customerId ?? ""),
  }));
}

function unique(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}
