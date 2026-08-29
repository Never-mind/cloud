import { queryRows, type Row } from "./db";
import { getPartyShortName } from "./party-reference";

export async function attachPartyCodes<T extends Row>(rows: T[]): Promise<Array<T & {
  supplierCode: string;
  supplierName: string;
  undertakingUnitCode: string;
  undertakingUnitName: string;
  customerCode: string;
  customerName: string;
}>> {
  const supplierIds = unique(rows.map((row) => row.supplierId));
  const undertakingUnitIds = unique(rows.map((row) => row.undertakingUnitId));
  const customerIds = unique(rows.map((row) => row.customerId));
  const [suppliers, undertakingUnits, customers] = await Promise.all([
    supplierIds.length ? queryRows<Row>("SELECT supplierId, supplierCode, shortName, nameCn FROM common_suppliers WHERE supplierId IN (:supplierIds) OR supplierCode IN (:supplierIds)", { supplierIds }) : [],
    undertakingUnitIds.length ? queryRows<Row>("SELECT undertakingUnitId, undertakingUnitCode, entityCode, shortName, entityName, name FROM common_undertaking_units WHERE undertakingUnitId IN (:undertakingUnitIds) OR undertakingUnitCode IN (:undertakingUnitIds) OR entityCode IN (:undertakingUnitIds)", { undertakingUnitIds }) : [],
    customerIds.length ? queryRows<Row>("SELECT customerId, customerCode, shortName, nameCn, name FROM common_customers WHERE customerId IN (:customerIds) OR customerCode IN (:customerIds)", { customerIds }) : [],
  ]);
  const supplierByReference = buildReferenceMap(suppliers, ["supplierId", "supplierCode"]);
  const undertakingUnitByReference = buildReferenceMap(undertakingUnits, ["undertakingUnitId", "undertakingUnitCode", "entityCode"]);
  const customerByReference = buildReferenceMap(customers, ["customerId", "customerCode"]);

  return rows.map((row) => ({
    ...row,
    supplierCode: String(supplierByReference.get(String(row.supplierId ?? ""))?.supplierCode ?? row.supplierId ?? ""),
    supplierName: getPartyShortName(supplierByReference.get(String(row.supplierId ?? "")) ?? {}, ["supplierCode", "supplierId"]) || String(row.supplierId ?? ""),
    undertakingUnitCode: String(undertakingUnitByReference.get(String(row.undertakingUnitId ?? ""))?.undertakingUnitCode ?? row.undertakingUnitId ?? ""),
    undertakingUnitName: getPartyShortName(undertakingUnitByReference.get(String(row.undertakingUnitId ?? "")) ?? {}, ["undertakingUnitCode", "undertakingUnitId"]) || String(row.undertakingUnitId ?? ""),
    customerCode: String(customerByReference.get(String(row.customerId ?? ""))?.customerCode ?? row.customerId ?? ""),
    customerName: getPartyShortName(customerByReference.get(String(row.customerId ?? "")) ?? {}, ["customerCode", "customerId"]) || String(row.customerId ?? ""),
  }));
}

function buildReferenceMap(rows: Row[], keys: string[]) {
  const map = new Map<string, Row>();
  for (const row of rows) {
    for (const key of keys) {
      const value = String(row[key] ?? "").trim();
      if (value) map.set(value, row);
    }
  }
  return map;
}

function unique(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}
