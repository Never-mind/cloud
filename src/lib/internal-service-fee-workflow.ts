export type InternalServiceLedgerInput = {
  ledgerId: string;
  countryCode: string;
  batchName: string;
  requestNo: string;
  poNo: string;
  deviceCode: string;
  modelCode: string;
  nameEn: string;
  supplierId: string;
  undertakingUnitId: string;
  customerId: string;
  quantity: number;
  currency: string;
  vatRate: number;
  procurementTaxExcludedUnitPrice: number;
  procurementTaxSurcharge: number;
  startMonth: string;
};

export type InternalServiceMonthlyRow = InternalServiceLedgerInput & {
  id: string;
  writeOffMonth: string;
  monthIndex: number;
  internalServiceFeeAmount: number;
  sourceType: "auto" | "manual";
  adjustmentNo: string;
  archived: boolean;
};

export type InternalServiceAdjustment = {
  adjustmentNo: string;
  startMonth: string;
  endMonth: string;
  monthlyAmount: number;
  confirmedAt?: string | Date | null;
};

export type InternalServicePricingAdjustment = {
  adjustmentNo: string;
  effectiveMonth: string;
  first24MonthlyAmount: number;
  next36MonthlyAmount: number;
};

export type InternalServiceCalculation = {
  contractRevenueIncludingTax: number;
  contractRevenueExcludingTax: number;
  procurementCost: number;
  internalServiceFeeTotal: number;
  archivedAmount: number;
  manualAmount: number;
  remainingAmount: number;
  unallocatedAmount: number;
  rows: InternalServiceMonthlyRow[];
};

const TOTAL_MONTHS = 60;

export function buildInternalServiceFeeSchedule({
  ledger,
  billingMonthlyAmounts,
  existingRows = [],
  adjustments = [],
  pricingAdjustments = [],
}: {
  ledger: InternalServiceLedgerInput;
  billingMonthlyAmounts: number[];
  existingRows?: InternalServiceMonthlyRow[];
  adjustments?: InternalServiceAdjustment[];
  pricingAdjustments?: InternalServicePricingAdjustment[];
}): InternalServiceCalculation {
  const vatRate = Number(ledger.vatRate ?? 0);
  const quantity = Number(ledger.quantity ?? 0);
  const normalizedBilling = Array.from({ length: TOTAL_MONTHS }, (_, index) => Number(billingMonthlyAmounts[index] ?? 0));
  const procurementCost = roundMoney(quantity * (Number(ledger.procurementTaxExcludedUnitPrice ?? 0) + Number(ledger.procurementTaxSurcharge ?? 0)));
  const existingByMonth = new Map(existingRows.map((row) => [row.writeOffMonth, row]));

  const rows = Array.from({ length: TOTAL_MONTHS }, (_, index) => {
    const monthIndex = index + 1;
    const writeOffMonth = addMonths(ledger.startMonth, index);
    const existing = existingByMonth.get(writeOffMonth);
    return {
      ...ledger,
      id: `ISF-${ledger.ledgerId}-${String(monthIndex).padStart(3, "0")}`,
      writeOffMonth,
      monthIndex,
      internalServiceFeeAmount: existing?.archived ? Number(existing.internalServiceFeeAmount ?? 0) : 0,
      sourceType: existing?.archived ? existing.sourceType : "auto",
      adjustmentNo: existing?.archived ? existing.adjustmentNo : "",
      archived: Boolean(existing?.archived),
    } satisfies InternalServiceMonthlyRow;
  });

  const initialRevenueExcludingTax = roundMoney(normalizedBilling.reduce((total, amount) => total + amount, 0) / (1 + vatRate));
  const initialInternalServiceFeeTotal = roundMoney(initialRevenueExcludingTax - procurementCost);
  allocateInitialTwoStage(rows, initialInternalServiceFeeTotal);

  const manualByMonth = new Map<string, InternalServiceAdjustment>();
  for (const adjustment of [...adjustments].sort(compareAdjustment)) {
    for (const row of rows) {
      if (!row.archived && row.writeOffMonth >= firstDayOfMonth(adjustment.startMonth) && row.writeOffMonth <= firstDayOfMonth(adjustment.endMonth)) {
        manualByMonth.set(row.writeOffMonth, adjustment);
      }
    }
  }

  const manualRows = rows.filter((row) => manualByMonth.has(row.writeOffMonth));
  for (const row of manualRows) {
    const adjustment = manualByMonth.get(row.writeOffMonth)!;
    row.internalServiceFeeAmount = roundMoney(adjustment.monthlyAmount);
    row.sourceType = "manual";
    row.adjustmentNo = adjustment.adjustmentNo;
  }

  const currentRevenuePlan = [...normalizedBilling];
  for (const adjustment of pricingAdjustments.sort((left, right) => left.effectiveMonth.localeCompare(right.effectiveMonth))) {
    const effectiveMonth = firstDayOfMonth(adjustment.effectiveMonth);
    const firstAffectedIndex = rows.findIndex((row) => row.writeOffMonth >= effectiveMonth);
    if (firstAffectedIndex < 0) continue;
    for (let index = firstAffectedIndex; index < TOTAL_MONTHS; index += 1) {
      currentRevenuePlan[index] = rows[index].monthIndex <= 24
        ? Number(adjustment.first24MonthlyAmount ?? 0)
        : Number(adjustment.next36MonthlyAmount ?? 0);
    }
    const revisedTotal = roundMoney(currentRevenuePlan.reduce((total, amount) => total + amount, 0) / (1 + vatRate) - procurementCost);
    const fixedRows = rows.filter((row, index) => index < firstAffectedIndex || row.archived || manualByMonth.has(row.writeOffMonth));
    const automaticRows = rows.filter((row, index) => index >= firstAffectedIndex && !row.archived && !manualByMonth.has(row.writeOffMonth));
    const fixedAmount = roundMoney(fixedRows.reduce((total, row) => total + row.internalServiceFeeAmount, 0));
    allocateRows(automaticRows, roundMoney(revisedTotal - fixedAmount));
  }

  const contractRevenueIncludingTax = roundMoney(currentRevenuePlan.reduce((total, amount) => total + amount, 0));
  const contractRevenueExcludingTax = roundMoney(contractRevenueIncludingTax / (1 + vatRate));
  const internalServiceFeeTotal = roundMoney(contractRevenueExcludingTax - procurementCost);
  const archivedAmount = roundMoney(rows.filter((row) => row.archived).reduce((total, row) => total + row.internalServiceFeeAmount, 0));
  const manualAmount = roundMoney(rows.filter((row) => !row.archived && manualByMonth.has(row.writeOffMonth)).reduce((total, row) => total + row.internalServiceFeeAmount, 0));
  const unarchivedAmount = roundMoney(rows.filter((row) => !row.archived).reduce((total, row) => total + row.internalServiceFeeAmount, 0));
  const remainingAmount = roundMoney(internalServiceFeeTotal - archivedAmount);

  return {
    contractRevenueIncludingTax,
    contractRevenueExcludingTax,
    procurementCost,
    internalServiceFeeTotal,
    archivedAmount,
    manualAmount,
    remainingAmount,
    unallocatedAmount: roundMoney(internalServiceFeeTotal - archivedAmount - unarchivedAmount),
    rows,
  };
}

function allocateInitialTwoStage(rows: InternalServiceMonthlyRow[], total: number) {
  const firstStage = rows.slice(0, 24);
  const secondStage = rows.slice(24);
  allocateRows(firstStage, roundMoney(total / 2));
  allocateRows(secondStage, roundMoney(total - firstStage.reduce((sum, row) => sum + row.internalServiceFeeAmount, 0)));
}

function allocateRows(rows: InternalServiceMonthlyRow[], total: number) {
  const allocation = rows.length ? roundMoney(total / rows.length) : 0;
  rows.forEach((row, index) => {
    row.internalServiceFeeAmount = index === rows.length - 1
      ? roundMoney(total - allocation * (rows.length - 1))
      : allocation;
    row.sourceType = "auto";
    row.adjustmentNo = "";
  });
}

export function firstDayOfMonth(value: string | Date) {
  const source = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const date = new Date(`${source}T00:00:00`);
  if (Number.isNaN(date.getTime())) return source;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function addMonths(startMonth: string, offset: number) {
  const date = new Date(`${firstDayOfMonth(startMonth)}T00:00:00`);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function compareAdjustment(left: InternalServiceAdjustment, right: InternalServiceAdjustment) {
  const confirmedDiff = getTime(left.confirmedAt) - getTime(right.confirmedAt);
  if (confirmedDiff !== 0) return confirmedDiff;
  return left.adjustmentNo.localeCompare(right.adjustmentNo);
}

function getTime(value: string | Date | null | undefined) {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(String(value).replace(" ", "T")).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
