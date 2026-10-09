/**
 * 「承接单位 / 供应商 / 客户」按 ID 回查档案当前简称的 SQL 表达式。
 *
 * 列表展示走 attachPartyCodes（JS 侧解析），但**筛选、排序、筛选候选值**必须在 SQL 里算，
 * 否则列上显示简称、三横杠却按编码筛，两边对不上。
 * 取不到简称时依次退回全称、编码，保证档案没录简称时列不会空白。
 * 口径与 src/lib/party-display.ts 的展示保持一致。
 */
export function partyShortNameExpression(party: "supplier" | "undertakingUnit" | "customer", idExpression: string) {
  const config = {
    supplier: { table: "merge_common_suppliers", idColumn: "supplierId", codeColumn: "supplierCode", nameColumns: ["shortName", "nameCn"] },
    undertakingUnit: { table: "merge_common_undertaking_units", idColumn: "undertakingUnitId", codeColumn: "undertakingUnitCode", nameColumns: ["shortName", "entityName", "name"] },
    customer: { table: "merge_common_customers", idColumn: "customerId", codeColumn: "customerCode", nameColumns: ["shortName", "nameCn", "name"] },
  }[party];
  const names = config.nameColumns.map((column) => `NULLIF(party.${column}, '')`).join(", ");
  return `(SELECT COALESCE(${names}, party.${config.codeColumn}) FROM ${config.table} party WHERE party.${config.idColumn} = ${idExpression} OR party.${config.codeColumn} = ${idExpression} LIMIT 1)`;
}

export function partyNameExpressions(ids: { supplierId: string; undertakingUnitId: string; customerId: string }) {
  return {
    supplierName: partyShortNameExpression("supplier", ids.supplierId),
    undertakingUnitName: partyShortNameExpression("undertakingUnit", ids.undertakingUnitId),
    customerName: partyShortNameExpression("customer", ids.customerId),
  };
}
