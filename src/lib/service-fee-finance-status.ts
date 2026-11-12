/** 按当期账单原币种的含税服务费判断，不根据发票/回款金额或折算USD判断。 */
export function serviceFeeSettlementNotRequired(amount: unknown): boolean {
  if (typeof amount !== "number" && typeof amount !== "string") return false;
  if (typeof amount === "string" && !amount.trim()) return false;
  const value = Number(amount);
  return Number.isFinite(value) && Math.abs(value) < 1;
}

export type ServiceFeeFinanceStatusField = "invoiceStatus" | "repaymentStatus";
export type ServiceFeeInvoiceStatus = "未开票" | "已开票" | "无需开票";
export type ServiceFeeRepaymentStatus = "未回款" | "已回款" | "无需回款";

export function serviceFeeFinanceStatuses(row: {
  serviceFeeTotal?: unknown;
  invoiceStatus?: unknown;
  repaymentStatus?: unknown;
  invoiceNo?: unknown;
  invoiceOriginalName?: unknown;
  repaymentDate?: unknown;
  repaymentAmount?: unknown;
  repaymentAmountExcludingTax?: unknown;
}) {
  const notRequired = serviceFeeSettlementNotRequired(row.serviceFeeTotal);
  const hasInvoice = [row.invoiceNo, row.invoiceOriginalName].some(value => Boolean(String(value ?? "").trim()));
  const hasReceipt = Boolean(row.repaymentDate) && [row.repaymentAmount, row.repaymentAmountExcludingTax]
    .some(value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)));
  return {
    invoiceStatus: (notRequired ? "无需开票" : row.invoiceStatus === "已开票" || (row.invoiceStatus === "无需开票" && hasInvoice) ? "已开票" : "未开票") as ServiceFeeInvoiceStatus,
    repaymentStatus: (notRequired ? "无需回款" : row.repaymentStatus === "已回款" || (row.repaymentStatus === "无需回款" && hasReceipt) ? "已回款" : "未回款") as ServiceFeeRepaymentStatus,
  };
}

/** 仅用于写入。默认在金额离开小额范围时，根据留存发票/到账记录恢复办理状态。 */
export function serviceFeeFinanceStatusWriteSql(field: ServiceFeeFinanceStatusField, normalStatusSql?: string, source = "") {
  const label = field === "invoiceStatus" ? "开票" : "回款";
  const evidence = field === "invoiceStatus"
    ? `(NULLIF(TRIM(${source}invoiceNo), '') IS NOT NULL OR NULLIF(TRIM(${source}invoiceOriginalName), '') IS NOT NULL)`
    : `(${source}repaymentDate IS NOT NULL AND (${source}repaymentAmount IS NOT NULL OR ${source}repaymentAmountExcludingTax IS NOT NULL))`;
  const fallback = normalStatusSql ?? `(CASE WHEN ${source}${field} = '无需${label}' THEN CASE WHEN ${evidence} THEN '已${label}' ELSE '未${label}' END ELSE COALESCE(NULLIF(${source}${field}, ''), '未${label}') END)`;
  return `(CASE WHEN ABS(${source}serviceFeeTotal) < 1 THEN '无需${label}' ELSE ${fallback} END)`;
}
