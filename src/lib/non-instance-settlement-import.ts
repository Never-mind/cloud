export type NonInstanceExpenseLine = Record<string, string>;

export type NonInstanceSettlementColumn = {
  key: string;
  label: string;
  kind?: "date" | "number" | "percentage" | "select" | "text";
  required?: boolean;
  derived?: boolean;
};

export type NonInstanceImportFailure = {
  rowNumber: number;
  error: string;
};

export const NON_INSTANCE_EXPENSE_TYPES = [
  "备件结差",
  "清关费 OPEX",
  "跨境业务金融税",
  "人力及行政成本",
  "其他非实例 OPEX",
] as const;

export const NON_INSTANCE_SETTLEMENT_CURRENCIES = ["USD", "CNY", "BRL", "MXN", "CLP"] as const;

export type NonInstanceExpenseType = (typeof NON_INSTANCE_EXPENSE_TYPES)[number];

export type NonInstanceCalculationResult = {
  values: Record<string, number | string>;
  formula: string;
  ruleVersion: string;
  errors: string[];
};

const NUMBER_KEYS = new Set([
  "deviceNodeQuantity", "deliveryQuantity", "settlementQuantity", "taxExcludedUnitPriceUsd", "paymentExchangeRate",
  "taxExcludedTotalUsd", "taxExcludedTotalCny", "equipmentTotalUsd", "localTaxRate", "calculatedTaxAmountUsd", "feeAmount", "usdExchangeRate",
  "settlementAmountUsd", "issRate", "issExcludedAmountUsd",
]);

const DATE_KEYS = new Set(["expenseDate"]);

export function createBlankNonInstanceSettlementLine(expenseType: string): NonInstanceExpenseLine {
  return {
    expenseType,
    differenceNature: expenseType === "备件结差" ? "CAPEX" : "OPEX",
    batchName: "",
    expenseDate: "",
    documentNo: "",
    deviceNodeQuantity: "",
    deliveryQuantity: "",
    settlementQuantity: "",
    taxExcludedUnitPriceUsd: "",
    priceConfirmation: "YES",
    paymentExchangeRate: "",
    taxExcludedTotalUsd: "",
    taxExcludedTotalCny: "",
    equipmentTotalUsd: "",
    localTaxRate: "",
    calculatedTaxAmountUsd: "",
    expenseCategory: "",
    expenseName: "",
    expenseProvider: "",
    feeCurrency: "USD",
    feeAmount: "",
    usdExchangeRate: "",
    settlementAmountUsd: "",
    issRate: "",
    issExcludedAmountUsd: "",
    confirmationResult: "YES",
    sourceReference: "",
    notes: "",
  };
}

function numberValue(value: unknown, fallback = 0) {
  const source = text(value).replaceAll(",", "").replace(/%$/, "");
  if (!source) return fallback;
  const parsed = Number(source);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rateValue(value: unknown) {
  const parsed = numberValue(value);
  return parsed > 1 ? parsed / 100 : parsed;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function firstPositive(...values: unknown[]) {
  return values.map((value) => numberValue(value)).find((value) => value > 0) ?? 0;
}

function amountValues(amount: number, nature: string) {
  const rounded = money(amount);
  return {
    differenceNature: nature,
    capexDifferenceUnitPrice: nature === "CAPEX" ? rounded : 0,
    capexDifferenceTotal: nature === "CAPEX" ? rounded : 0,
    opexDifferenceUnitPrice: nature === "OPEX" ? rounded : 0,
    opexDifferenceTotal: nature === "OPEX" ? rounded : 0,
    differenceTotal: rounded,
  };
}

export function calculateNonInstanceLine(expenseType: string, input: Record<string, unknown>): NonInstanceCalculationResult {
  const errors: string[] = [];

  if (expenseType === "备件结差") {
    const quantity = firstPositive(input.settlementQuantity, input.deliveryQuantity, input.deviceNodeQuantity, input.quantity);
    const unitPrice = numberValue(input.taxExcludedUnitPriceUsd);
    const paymentRate = numberValue(input.paymentExchangeRate);
    if (quantity <= 0) errors.push("结算数量必须大于0");
    if (unitPrice <= 0) errors.push("设备不含税单价 USD 必须大于0");
    if (paymentRate <= 0) errors.push("支付时汇率必须大于0");
    if (errors.length) {
      return { values: {}, formula: "不含税总价 USD = 结算数量 × 设备不含税单价 USD；不含税总价 CNY = 不含税总价 USD × 支付时汇率", ruleVersion: "non-instance-v1", errors };
    }
    const totalUsd = money(quantity * unitPrice);
    const totalCny = money(totalUsd * paymentRate);
    return {
      values: {
        settlementQuantity: quantity,
        taxExcludedTotalUsd: totalUsd,
        taxExcludedTotalCny: totalCny,
        settlementAmountUsd: totalUsd,
        ...amountValues(totalUsd, "CAPEX"),
      },
      formula: "不含税总价 USD = 结算数量 × 设备不含税单价 USD；不含税总价 CNY = 不含税总价 USD × 支付时汇率；结差金额 = 不含税总价 USD",
      ruleVersion: "non-instance-v1",
      errors,
    };
  }

  if (expenseType === "清关费 OPEX") {
    const equipmentTotalUsd = numberValue(input.equipmentTotalUsd);
    const localTaxRate = rateValue(input.localTaxRate);
    const feeAmount = numberValue(input.feeAmount);
    const exchangeRate = text(input.feeCurrency).toUpperCase() === "USD" ? 1 : numberValue(input.usdExchangeRate);
    if (equipmentTotalUsd <= 0) errors.push("设备总额 USD 必须大于0");
    if (!hasValue(input.localTaxRate) || localTaxRate < 0) errors.push("当地税率不能为空");
    if (feeAmount <= 0) errors.push("实际费用金额必须大于0");
    if (exchangeRate <= 0) errors.push("USD兑换汇率必须大于0");
    if (errors.length) {
      return { values: {}, formula: "理论清关税费 USD = 设备总额 USD × 当地税率；实际结算 USD = 实际费用金额 ÷ USD兑换汇率；结差默认采用实际结算 USD", ruleVersion: "non-instance-v1", errors };
    }
    const calculatedTaxAmountUsd = money(equipmentTotalUsd * localTaxRate);
    const settlementAmountUsd = money(feeAmount / exchangeRate);
    return {
      values: {
        calculatedTaxAmountUsd,
        settlementAmountUsd,
        ...amountValues(settlementAmountUsd, "OPEX"),
      },
      formula: "理论清关税费 USD = 设备总额 USD × 当地税率；实际结算 USD = 实际费用金额 ÷ USD兑换汇率；结差默认采用实际结算 USD",
      ruleVersion: "non-instance-v1",
      errors,
    };
  }

  if (expenseType === "跨境业务金融税") {
    const taxBaseUsd = numberValue(input.equipmentTotalUsd);
    const financialTaxRate = rateValue(input.localTaxRate);
    const issRate = rateValue(input.issRate);
    const usdCnyRate = numberValue(input.usdExchangeRate);
    if (taxBaseUsd <= 0) errors.push("计税基数 USD 必须大于0");
    if (!hasValue(input.localTaxRate) || financialTaxRate < 0) errors.push("金融税率不能为空");
    if (!hasValue(input.issRate) || issRate < 0 || issRate >= 1) errors.push("ISS税率必须在0%至100%之间");
    if (usdCnyRate <= 0) errors.push("USD/CNY汇率必须大于0");
    if (errors.length) {
      return { values: {}, formula: "金融税金额 USD = 计税基数 USD × 金融税率；扣除ISS后 USD = 金融税金额 USD × (1 - ISS税率)；人民币金额 = 扣除ISS后 USD × USD/CNY汇率", ruleVersion: "non-instance-v1", errors };
    }
    const feeAmount = money(taxBaseUsd * financialTaxRate);
    const issExcludedAmountUsd = money(feeAmount * (1 - issRate));
    const taxExcludedTotalCny = money(issExcludedAmountUsd * usdCnyRate);
    return {
      values: {
        feeAmount,
        issExcludedAmountUsd,
        taxExcludedTotalCny,
        settlementAmountUsd: issExcludedAmountUsd,
        ...amountValues(issExcludedAmountUsd, "OPEX"),
      },
      formula: "金融税金额 USD = 计税基数 USD × 金融税率；扣除ISS后 USD = 金融税金额 USD × (1 - ISS税率)；人民币金额 = 扣除ISS后 USD × USD/CNY汇率",
      ruleVersion: "non-instance-v1",
      errors,
    };
  }

  const feeAmount = numberValue(input.feeAmount);
  const exchangeRate = text(input.feeCurrency).toUpperCase() === "USD" ? 1 : numberValue(input.usdExchangeRate);
  if (feeAmount <= 0) errors.push("原币金额必须大于0");
  if (exchangeRate <= 0) errors.push("兑USD汇率必须大于0");
  if (errors.length) {
    return { values: {}, formula: "实际支付 USD = 原币金额 ÷ 兑USD汇率；结差金额 = 实际支付 USD", ruleVersion: "non-instance-v1", errors };
  }
  const settlementAmountUsd = money(feeAmount / exchangeRate);
  return {
    values: { settlementAmountUsd, ...amountValues(settlementAmountUsd, text(input.differenceNature).toUpperCase() === "CAPEX" ? "CAPEX" : "OPEX") },
    formula: "实际支付 USD = 原币金额 ÷ 兑USD汇率；结差金额 = 实际支付 USD",
    ruleVersion: "non-instance-v1",
    errors,
  };
}

export function validateNonInstanceLine(expenseType: string, line: Record<string, unknown>) {
  const errors: string[] = [];
  if (expenseType === "备件结差") {
    if (!hasValue(line.batchName)) errors.push("缺少批次");
    if (!hasValue(line.expenseDate)) errors.push("缺少签收时间");
  } else if (expenseType === "清关费 OPEX") {
    if (!hasValue(line.expenseDate)) errors.push("缺少清关/签收日期");
  } else if (expenseType === "跨境业务金融税") {
    if (!hasValue(line.expenseDate)) errors.push("缺少结算月份");
  } else {
    if (!hasValue(line.expenseName)) errors.push("缺少费用明细/人员");
    if (!hasValue(line.expenseDate)) errors.push("缺少费用月份");
  }
  return [...errors, ...calculateNonInstanceLine(expenseType, line).errors];
}

export function nonInstanceSettlementColumns(expenseType: string): NonInstanceSettlementColumn[] {
  if (expenseType === "备件结差") return [
    { key: "batchName", label: "批次", required: true }, { key: "expenseDate", label: "签收时间", kind: "date", required: true }, { key: "documentNo", label: "订单/报价参考" }, { key: "deviceNodeQuantity", label: "设备节点数量", kind: "number" },
    { key: "deliveryQuantity", label: "备件交付数量", kind: "number" }, { key: "settlementQuantity", label: "结算数量", kind: "number", required: true }, { key: "taxExcludedUnitPriceUsd", label: "设备不含税单价 USD", kind: "number", required: true },
    { key: "priceConfirmation", label: "单价确认", kind: "select" }, { key: "paymentExchangeRate", label: "支付时汇率（CNY/USD）", kind: "number", required: true }, { key: "taxExcludedTotalUsd", label: "不含税总价 USD（系统计算）", kind: "number", derived: true },
    { key: "taxExcludedTotalCny", label: "不含税总价 CNY（系统计算）", kind: "number", derived: true }, { key: "differenceNature", label: "结差性质", kind: "select" }, { key: "notes", label: "备注" },
  ];
  if (expenseType === "清关费 OPEX") return [
    { key: "batchName", label: "批次" }, { key: "expenseDate", label: "清关/签收日期", kind: "date", required: true }, { key: "documentNo", label: "清关文件号" }, { key: "deviceNodeQuantity", label: "设备数量", kind: "number" },
    { key: "equipmentTotalUsd", label: "设备总额 USD", kind: "number", required: true }, { key: "localTaxRate", label: "当地税率（%）", kind: "percentage", required: true }, { key: "calculatedTaxAmountUsd", label: "理论清关税费 USD（系统计算）", kind: "number", derived: true }, { key: "expenseCategory", label: "费用类别" }, { key: "expenseProvider", label: "服务商" },
    { key: "feeCurrency", label: "费用币种", kind: "select" }, { key: "feeAmount", label: "实际费用金额", kind: "number", required: true }, { key: "usdExchangeRate", label: "USD兑换汇率", kind: "number" }, { key: "settlementAmountUsd", label: "实际结算 USD（系统计算）", kind: "number", derived: true },
    { key: "confirmationResult", label: "确认结果", kind: "select" }, { key: "notes", label: "备注" },
  ];
  if (expenseType === "跨境业务金融税") return [
    { key: "expenseDate", label: "结算月份", kind: "date", required: true }, { key: "equipmentTotalUsd", label: "计税基数 USD", kind: "number", required: true }, { key: "localTaxRate", label: "金融税率（%）", kind: "percentage", required: true }, { key: "feeAmount", label: "金融税金额 USD（系统计算）", kind: "number", derived: true },
    { key: "issRate", label: "ISS税率（%）", kind: "percentage", required: true }, { key: "issExcludedAmountUsd", label: "扣除ISS后 USD（系统计算）", kind: "number", derived: true }, { key: "usdExchangeRate", label: "USD/CNY汇率", kind: "number", required: true }, { key: "taxExcludedTotalCny", label: "对应人民币金额（系统计算）", kind: "number", derived: true },
    { key: "confirmationResult", label: "确认结果", kind: "select" }, { key: "sourceReference", label: "来源凭证" }, { key: "notes", label: "备注" },
  ];
  return [
    { key: "expenseCategory", label: "费用大类" }, { key: "expenseName", label: "费用明细/人员", required: true }, { key: "expenseDate", label: "费用月份", kind: "date", required: true }, { key: "batchName", label: "关联批次" },
    { key: "feeAmount", label: "原币金额", kind: "number", required: true }, { key: "feeCurrency", label: "原币币种", kind: "select", required: true }, { key: "usdExchangeRate", label: "兑USD汇率", kind: "number" }, { key: "settlementAmountUsd", label: "实际支付 USD（系统计算）", kind: "number", derived: true },
    { key: "differenceNature", label: "结差性质", kind: "select" }, { key: "confirmationResult", label: "确认结果", kind: "select" }, { key: "sourceReference", label: "来源凭证" }, { key: "notes", label: "备注" },
  ];
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function hasValue(value: unknown) {
  return text(value) !== "";
}

function isNumericValue(value: unknown) {
  const source = text(value).replaceAll(",", "").replace(/%$/, "");
  return source !== "" && Number.isFinite(Number(source));
}

function normalizeDate(value: unknown) {
  const source = text(value);
  if (!source) return "";
  const matched = source.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (matched) {
    const [, year, month, day] = matched;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const date = new Date(source);
  if (Number.isNaN(date.valueOf())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validateBusinessFields(expenseType: string, line: NonInstanceExpenseLine) {
  return validateNonInstanceLine(expenseType, line)[0] ?? "";
}

export function importNonInstanceSettlementRows(expenseType: string, rows: Array<Record<string, unknown>>) {
  const columns = nonInstanceSettlementColumns(expenseType);
  const lines: NonInstanceExpenseLine[] = [];
  const failures: NonInstanceImportFailure[] = [];
  rows.forEach((row, index) => {
    const line = createBlankNonInstanceSettlementLine(expenseType);
    columns.forEach((column) => {
      const raw = row[column.label] ?? row[column.key] ?? "";
      if (!hasValue(raw) && hasValue(line[column.key])) return;
      if (DATE_KEYS.has(column.key)) {
        const date = normalizeDate(raw);
        line[column.key] = date ?? text(raw);
      } else {
        line[column.key] = text(raw);
      }
    });
    if (!columns.some((column) => hasValue(line[column.key]))) return;
    const invalidNumber = columns.find((column) => NUMBER_KEYS.has(column.key) && hasValue(line[column.key]) && !isNumericValue(line[column.key]));
    if (invalidNumber) {
      failures.push({ rowNumber: index + 2, error: `${invalidNumber.label}必须为数字` });
      return;
    }
    const invalidDate = columns.find((column) => DATE_KEYS.has(column.key) && hasValue(line[column.key]) && !/^\d{4}-\d{2}-\d{2}$/.test(line[column.key]));
    if (invalidDate) {
      failures.push({ rowNumber: index + 2, error: `${invalidDate.label}不是有效日期` });
      return;
    }
    const businessError = validateBusinessFields(expenseType, line);
    if (businessError) {
      failures.push({ rowNumber: index + 2, error: businessError });
      return;
    }
    const calculation = calculateNonInstanceLine(expenseType, line);
    Object.entries(calculation.values).forEach(([key, value]) => {
      line[key] = String(value);
    });
    lines.push(line);
  });
  return { lines, failures };
}
