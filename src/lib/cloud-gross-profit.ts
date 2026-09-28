/**
 * 华为云对账的"万众结算毛利"。
 *
 * 口径：客户应收（不含税） − 供应商应付（不含税）。
 * 只在调用方没有给出明确数值时兜底，不覆盖人工填写/导入的既有值 ——
 * 实际业务里存在带额外扣减的行（例如某客户当月另有 1894.37 的调整），
 * 直接按公式覆盖会把这些调整抹掉。
 */
function toNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const raw = String(value).replace(/,/g, "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeCloudSettlementGrossProfit(input: {
  customerReceivableNet?: unknown;
  supplierPayableNet?: unknown;
}) {
  const receivable = toNumber(input.customerReceivableNet);
  const payable = toNumber(input.supplierPayableNet);
  if (receivable === null || payable === null) return null;
  // 对账金额都是 4 位小数，结果同样收敛到 4 位，避免浮点尾巴。
  return Math.round((receivable - payable) * 10000) / 10000;
}
