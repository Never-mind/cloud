/**
 * 发票金额口径：
 *   未税金额 + 税金 = 含税金额
 *   税率用百分数保存（13 表示 13%），与发票登记界面的显示一致。
 *
 * 识别结果、手工登记、接口保存都走同一套推导与校验，避免三处口径不一致。
 */

export type InvoiceTaxAmounts = {
  netAmount: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  grossAmount: number | null;
};

export function roundInvoiceAmount(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function roundInvoiceRate(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

function finiteOrNull(value: number | null | undefined) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** 只补缺失项，不覆盖用户/票面已经给出的值。 */
export function deriveInvoiceTaxAmounts(input: InvoiceTaxAmounts): InvoiceTaxAmounts {
  let netAmount = finiteOrNull(input.netAmount);
  let taxRate = finiteOrNull(input.taxRate);
  let taxAmount = finiteOrNull(input.taxAmount);
  let grossAmount = finiteOrNull(input.grossAmount);

  if (netAmount !== null && taxRate !== null) {
    if (taxAmount === null) taxAmount = roundInvoiceAmount(netAmount * taxRate / 100);
    if (grossAmount === null) grossAmount = roundInvoiceAmount(netAmount + taxAmount);
  }
  if (netAmount !== null && taxAmount !== null) {
    if (grossAmount === null) grossAmount = roundInvoiceAmount(netAmount + taxAmount);
    if (taxRate === null && netAmount !== 0) taxRate = roundInvoiceRate(taxAmount / netAmount * 100);
  }
  if (grossAmount !== null && taxAmount !== null) {
    if (netAmount === null) netAmount = roundInvoiceAmount(grossAmount - taxAmount);
    if (taxRate === null && netAmount !== null && netAmount !== 0) taxRate = roundInvoiceRate(taxAmount / netAmount * 100);
  }
  if (netAmount !== null && grossAmount !== null) {
    if (taxAmount === null) taxAmount = roundInvoiceAmount(grossAmount - netAmount);
    if (taxRate === null && netAmount !== 0) taxRate = roundInvoiceRate(taxAmount / netAmount * 100);
  }

  return {
    netAmount: netAmount === null ? null : roundInvoiceAmount(netAmount),
    taxRate: taxRate === null ? null : roundInvoiceRate(taxRate),
    taxAmount: taxAmount === null ? null : roundInvoiceAmount(taxAmount),
    grossAmount: grossAmount === null ? null : roundInvoiceAmount(grossAmount),
  };
}

/** 返回空串表示通过；否则返回可直接展示给用户的中文错误。 */
export function validateInvoiceTaxAmounts(input: InvoiceTaxAmounts) {
  const values = deriveInvoiceTaxAmounts(input);
  for (const [value, label] of [
    [values.netAmount, "未税金额"],
    [values.taxAmount, "税金"],
    [values.grossAmount, "含税金额"],
  ] as const) {
    if (value !== null && value < 0) return `${label}不能小于 0`;
  }
  if (values.taxRate !== null && (values.taxRate < 0 || values.taxRate > 100)) {
    return "税率应在 0% 到 100% 之间";
  }
  if (values.netAmount !== null && values.taxAmount !== null && values.grossAmount !== null) {
    const difference = Math.abs(values.netAmount + values.taxAmount - values.grossAmount);
    if (difference > 0.01) {
      return `未税金额 + 税金与含税金额不一致（差额 ${difference.toFixed(2)}），请核对`;
    }
  }
  return "";
}
