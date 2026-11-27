export type InternalServiceSpareInput = {
  countryCode: string;
  batchName: string;
  spareName: string;
  spareCode: string;
  quantity: string | number;
  startMonth: string;
  procurementCostUsd: string | number;
  contractExcludingTaxUsd: string | number | null;
  managementFeeTotalUsd: string | number;
  first24MonthlyUsd: string | number;
  next36MonthlyUsd: string | number;
  notes: string;
};

export type InternalServiceSpareNormalized = {
  countryCode: string;
  batchName: string;
  spareName: string;
  spareCode: string;
  quantity: number;
  startMonth: string;
  procurementCostUsd: number;
  contractExcludingTaxUsd: number | null;
  managementFeeTotalUsd: number;
  first24MonthlyUsd: number;
  next36MonthlyUsd: number;
  notes: string;
  businessKey: string;
};

export type InternalServiceSpareImportFailure = {
  rowNumber: number;
  error: string;
};

export type InternalServiceSpareScheduleRow = {
  monthIndex: number;
  writeOffMonth: string;
  amount: number;
  archived: boolean;
};

export const INTERNAL_SERVICE_SPARE_FIELDS = [
  { key: "countryCode", label: "国家" },
  { key: "batchName", label: "批次" },
  { key: "spareName", label: "备件名称" },
  { key: "spareCode", label: "备件编码（可选）" },
  { key: "quantity", label: "数量" },
  { key: "startMonth", label: "开始月份" },
  { key: "procurementCostUsd", label: "采购成本 USD" },
  { key: "contractExcludingTaxUsd", label: "合同不含税金额 USD（可选）" },
  { key: "managementFeeTotalUsd", label: "管理费总额 USD" },
  { key: "first24MonthlyUsd", label: "前24个月月管理费 USD" },
  { key: "next36MonthlyUsd", label: "后36个月月管理费 USD" },
  { key: "notes", label: "备注" },
] as const;

const fieldKeyByLabel = new Map<string, keyof InternalServiceSpareInput>(
  INTERNAL_SERVICE_SPARE_FIELDS.map((field) => [field.label, field.key]),
);

export function blankInternalServiceSpare(): InternalServiceSpareInput {
  return {
    countryCode: "",
    batchName: "",
    spareName: "",
    spareCode: "",
    quantity: "1",
    startMonth: "",
    procurementCostUsd: "",
    contractExcludingTaxUsd: "",
    managementFeeTotalUsd: "",
    first24MonthlyUsd: "",
    next36MonthlyUsd: "",
    notes: "",
  };
}

export function normalizeInternalServiceSpare(input: InternalServiceSpareInput): {
  value: InternalServiceSpareNormalized | null;
  errors: string[];
} {
  const errors: string[] = [];
  const countryCode = String(input.countryCode ?? "").trim().toUpperCase();
  const batchName = String(input.batchName ?? "").trim();
  const spareName = String(input.spareName ?? "").trim();
  const spareCode = String(input.spareCode ?? "").trim();
  const startMonth = normalizeSpareMonth(input.startMonth);
  const quantity = decimal(input.quantity);
  const procurementCostUsd = decimal(input.procurementCostUsd);
  const contractExcludingTaxUsd = optionalDecimal(input.contractExcludingTaxUsd);
  const managementFeeTotalUsd = decimal(input.managementFeeTotalUsd);
  const first24MonthlyUsd = decimal(input.first24MonthlyUsd);
  const next36MonthlyUsd = decimal(input.next36MonthlyUsd);

  if (!countryCode) errors.push("请选择国家");
  if (!batchName) errors.push("请填写批次");
  if (!spareName) errors.push("请填写备件名称");
  if (quantity == null || quantity <= 0 || !Number.isInteger(quantity)) errors.push("数量必须是大于 0 的整数");
  if (!startMonth) errors.push("请填写有效的开始月份");
  if (procurementCostUsd == null || procurementCostUsd < 0) errors.push("采购成本不能小于 0");
  if (contractExcludingTaxUsd === undefined) errors.push("合同不含税金额格式不正确");
  if (managementFeeTotalUsd == null) errors.push("请填写有效的管理费总额");
  if (first24MonthlyUsd == null) errors.push("请填写有效的前24个月月管理费");
  if (next36MonthlyUsd == null) errors.push("请填写有效的后36个月月管理费");
  if (managementFeeTotalUsd != null && first24MonthlyUsd != null && next36MonthlyUsd != null) {
    const planned = money(first24MonthlyUsd * 24 + next36MonthlyUsd * 36);
    if (Math.abs(planned - money(managementFeeTotalUsd)) > 0.01) {
      errors.push(`管理费总额与分期金额不一致：前24个月×24 + 后36个月×36 = ${planned.toFixed(2)}`);
    }
  }

  if (errors.length) return { value: null, errors };
  return {
    value: {
      countryCode,
      batchName,
      spareName,
      spareCode,
      quantity: Number(quantity),
      startMonth,
      procurementCostUsd: money(Number(procurementCostUsd)),
      contractExcludingTaxUsd: contractExcludingTaxUsd == null ? null : money(contractExcludingTaxUsd),
      managementFeeTotalUsd: money(Number(managementFeeTotalUsd)),
      first24MonthlyUsd: money(Number(first24MonthlyUsd)),
      next36MonthlyUsd: money(Number(next36MonthlyUsd)),
      notes: String(input.notes ?? "").trim(),
      businessKey: internalServiceSpareBusinessKey({
        countryCode,
        batchName,
        spareName,
        spareCode,
        startMonth,
      }),
    },
    errors: [],
  };
}

export function internalServiceSpareBusinessKey(input: {
  countryCode: string;
  batchName: string;
  spareName: string;
  spareCode: string;
  startMonth: string;
}) {
  return [
    "spare",
    input.countryCode.trim().toUpperCase(),
    input.batchName.trim().toUpperCase(),
    (input.spareCode.trim() || input.spareName.trim()).toUpperCase(),
    normalizeSpareMonth(input.startMonth),
  ].join("|");
}

export function buildInternalServiceSpareSchedule(
  input: Pick<InternalServiceSpareNormalized, "startMonth" | "managementFeeTotalUsd" | "first24MonthlyUsd" | "next36MonthlyUsd">,
  archivedRows: Array<{ monthIndex: number; writeOffMonth: string; amount: number }> = [],
): InternalServiceSpareScheduleRow[] {
  const archivedByIndex = new Map<number, { writeOffMonth: string; amount: number }>();
  for (const row of archivedRows) {
    if (!Number.isInteger(row.monthIndex) || row.monthIndex < 1 || row.monthIndex > 60) {
      throw new Error(`已归档月份序号不正确：${row.monthIndex}`);
    }
    const expectedMonth = addSpareMonths(input.startMonth, row.monthIndex - 1);
    if (String(row.writeOffMonth).slice(0, 7) !== expectedMonth.slice(0, 7)) {
      throw new Error(`已有归档月份与备件开始月份不一致：${row.writeOffMonth}`);
    }
    archivedByIndex.set(row.monthIndex, { writeOffMonth: row.writeOffMonth, amount: money(row.amount) });
  }

  const baseAmounts = Array.from({ length: 60 }, (_, index) => money(index < 24 ? input.first24MonthlyUsd : input.next36MonthlyUsd));
  const amounts = baseAmounts.map((amount, index) => archivedByIndex.get(index + 1)?.amount ?? amount);
  const openIndexes = Array.from({ length: 60 }, (_, index) => index + 1).filter((index) => !archivedByIndex.has(index));
  const archivedTotal = money([...archivedByIndex.values()].reduce((total, row) => total + row.amount, 0));
  const targetTotal = money(input.managementFeeTotalUsd);

  if (openIndexes.length) {
    const openBaseTotal = money(openIndexes.reduce((total, monthIndex) => total + baseAmounts[monthIndex - 1], 0));
    const targetOpenTotal = money(targetTotal - archivedTotal);
    const lastOpenIndex = openIndexes.at(-1)!;
    amounts[lastOpenIndex - 1] = money(amounts[lastOpenIndex - 1] + targetOpenTotal - openBaseTotal);
  } else if (Math.abs(archivedTotal - targetTotal) > 0.01) {
    throw new Error("该备件的60个月均已归档，管理费总额必须等于已归档合计");
  }

  const resultTotal = money(amounts.reduce((total, amount) => total + amount, 0));
  if (Math.abs(resultTotal - targetTotal) > 0.01) {
    throw new Error(`备件60个月计划合计 ${resultTotal.toFixed(2)} 与管理费总额 ${targetTotal.toFixed(2)} 不一致`);
  }

  return amounts.map((amount, index) => {
    const monthIndex = index + 1;
    return {
      monthIndex,
      writeOffMonth: archivedByIndex.get(monthIndex)?.writeOffMonth ?? addSpareMonths(input.startMonth, index),
      amount,
      archived: archivedByIndex.has(monthIndex),
    };
  });
}

export function importInternalServiceSpareRows(rows: Array<Record<string, unknown>>) {
  const lines: InternalServiceSpareInput[] = [];
  const failures: InternalServiceSpareImportFailure[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const line = blankInternalServiceSpare();
    for (const [header, value] of Object.entries(row)) {
      const key = fieldKeyByLabel.get(header.trim());
      if (key) line[key] = value == null ? "" : String(value);
    }
    const normalized = normalizeInternalServiceSpare(line);
    if (normalized.errors.length) {
      failures.push({ rowNumber, error: normalized.errors[0] });
      return;
    }
    const businessKey = normalized.value!.businessKey;
    if (seen.has(businessKey)) {
      failures.push({ rowNumber, error: `同一文件存在重复备件：${normalized.value!.batchName} / ${normalized.value!.spareCode || normalized.value!.spareName}` });
      return;
    }
    seen.add(businessKey);
    lines.push(line);
  });
  return { lines, failures };
}

export function normalizeSpareMonth(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-01`;
  }
  const text = String(value ?? "").trim();
  const match = /^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?/.exec(text);
  if (!match) return "";
  const month = Number(match[2]);
  if (month < 1 || month > 12) return "";
  return `${match[1]}-${String(month).padStart(2, "0")}-01`;
}

function addSpareMonths(startMonth: string, offset: number) {
  const [year, month] = normalizeSpareMonth(startMonth).split("-").map(Number);
  const index = year * 12 + month - 1 + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}-01`;
}

function optionalDecimal(value: unknown) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = decimal(value);
  return parsed == null ? undefined : parsed;
}

function decimal(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .replaceAll(",", "")
    .replaceAll("$", "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
