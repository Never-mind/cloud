export type BillingPurchaseLine = {
  purchaseOrderItemId: string;
  countryCode: string;
  batchName: string;
  requestNo: string;
  poNo: string;
  deviceCode: string;
  modelCode: string;
  nameEn: string;
  supplierId?: string;
  undertakingUnitId?: string;
  customerId?: string;
  quantity: number;
  actualCurrency: string;
  actualUnitPrice: number;
  taxExcludedUnitPrice?: number;
  taxSurcharge?: number;
  vatRate?: number;
};

export type BillingInstanceContract = {
  contractNo: string;
  countryCode: string;
  deviceCode: string;
  currency: string;
  first24MonthPrice: number;
  next36MonthPrice: number;
  createdAt?: string | Date | null;
  dateSigned?: string | Date | null;
};

export type BillingLedgerDraft = BillingPurchaseLine & {
  ledgerId: string;
  instanceContractNo: string;
  contractCurrency: string;
  first24MonthPrice: number;
  next36MonthPrice: number;
  selfCalculatedUnitPrice: number;
  differenceUnitPrice: number;
  differenceTotalPrice: number;
  startMonth: string;
  status: string;
};

export type MonthlyBillingRow = {
  id: string;
  ledgerId: string;
  writeOffMonth: string;
  monthIndex: number;
  stage: "前24个月" | "后36个月";
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
  instanceContractNo: string;
  currency: string;
  monthlyAmount: number;
  monthlyTotalAmount: number;
  selfCalculatedUnitPrice: number;
  differenceUnitPrice: number;
  differenceTotalPrice: number;
  sourceType: "首次生成" | "调整单";
  adjustmentNo: string;
};

export type BillingAdjustmentInput = {
  adjustmentNo: string;
  instanceContractNo?: string;
  effectiveMonth: string;
  countryCode?: string;
  batchName?: string;
  deviceCode?: string;
  currency?: string;
  adjustedFirst24MonthPrice: number;
  adjustedNext36MonthPrice: number;
  confirmedAt?: string | Date | null;
};

const FIRST_STAGE_MONTHS = 24;
const TOTAL_MONTHS = 60;

export function findLatestInstanceContract(
  purchaseLine: Pick<BillingPurchaseLine, "countryCode" | "deviceCode">,
  contracts: BillingInstanceContract[],
) {
  const matched = contracts.filter(
    (contract) =>
      contract.countryCode === purchaseLine.countryCode &&
      contract.deviceCode === purchaseLine.deviceCode,
  );

  return matched.sort((left, right) => getTime(right.createdAt ?? right.dateSigned) - getTime(left.createdAt ?? left.dateSigned))[0] ?? null;
}

export function findSelectedInstanceContract(
  purchaseLine: Pick<BillingPurchaseLine, "countryCode" | "deviceCode">,
  contracts: BillingInstanceContract[],
  contractNo: string,
) {
  const selectedContractNo = contractNo.trim();
  if (!selectedContractNo) return null;

  return (
    contracts.find(
      (contract) =>
        contract.contractNo === selectedContractNo &&
        contract.countryCode === purchaseLine.countryCode &&
        contract.deviceCode === purchaseLine.deviceCode,
    ) ?? null
  );
}

export function buildBillingLedgerDraft({
  contract,
  purchaseLine,
  startMonth,
}: {
  contract: BillingInstanceContract;
  purchaseLine: BillingPurchaseLine;
  startMonth: string;
}): BillingLedgerDraft {
  return {
    ...purchaseLine,
    ledgerId: `BIL-${purchaseLine.purchaseOrderItemId}`,
    instanceContractNo: contract.contractNo,
    contractCurrency: contract.currency,
    first24MonthPrice: Number(contract.first24MonthPrice ?? 0),
    next36MonthPrice: Number(contract.next36MonthPrice ?? 0),
    selfCalculatedUnitPrice: calculateSelfCalculatedUnitPrice(purchaseLine),
    differenceUnitPrice: roundMoney(Number(contract.first24MonthPrice ?? 0) - calculateSelfCalculatedUnitPrice(purchaseLine)),
    differenceTotalPrice: roundMoney(Number(purchaseLine.quantity ?? 0) * (Number(contract.first24MonthPrice ?? 0) - calculateSelfCalculatedUnitPrice(purchaseLine))),
    startMonth: firstDayOfMonth(startMonth),
    status: "核销中",
  };
}

export function buildUpdatedBillingLedgerDraft({
  contract,
  currentLedger,
  startMonth,
}: {
  contract: BillingInstanceContract;
  currentLedger: BillingLedgerDraft;
  startMonth: string;
}): BillingLedgerDraft {
  return {
    ...currentLedger,
    instanceContractNo: contract.contractNo,
    contractCurrency: contract.currency,
    first24MonthPrice: Number(contract.first24MonthPrice ?? 0),
    next36MonthPrice: Number(contract.next36MonthPrice ?? 0),
    selfCalculatedUnitPrice: currentLedger.selfCalculatedUnitPrice,
    differenceUnitPrice: roundMoney(Number(contract.first24MonthPrice ?? 0) - currentLedger.selfCalculatedUnitPrice),
    differenceTotalPrice: roundMoney(Number(currentLedger.quantity ?? 0) * (Number(contract.first24MonthPrice ?? 0) - currentLedger.selfCalculatedUnitPrice)),
    startMonth: firstDayOfMonth(startMonth),
  };
}

export function buildMonthlyBillingRows(ledger: BillingLedgerDraft): MonthlyBillingRow[] {
  return Array.from({ length: TOTAL_MONTHS }, (_, index) => {
    const monthIndex = index + 1;
    const firstStage = monthIndex <= FIRST_STAGE_MONTHS;
    const quantity = Number(ledger.quantity ?? 0);
    const monthlyAmount = firstStage ? Number(ledger.first24MonthPrice ?? 0) : Number(ledger.next36MonthPrice ?? 0);
    const selfCalculatedUnitPrice = Number(ledger.selfCalculatedUnitPrice ?? 0);

    return {
      id: `MBW-${ledger.ledgerId}-${String(monthIndex).padStart(3, "0")}`,
      ledgerId: ledger.ledgerId,
      writeOffMonth: addMonths(ledger.startMonth, index),
      monthIndex,
      stage: firstStage ? "前24个月" : "后36个月",
      countryCode: ledger.countryCode,
      batchName: ledger.batchName,
      requestNo: ledger.requestNo,
      poNo: ledger.poNo,
      deviceCode: ledger.deviceCode,
      modelCode: ledger.modelCode,
      nameEn: ledger.nameEn,
      supplierId: ledger.supplierId ?? "",
      undertakingUnitId: ledger.undertakingUnitId ?? "",
      customerId: ledger.customerId ?? "",
      quantity,
      instanceContractNo: ledger.instanceContractNo,
      currency: ledger.contractCurrency,
      monthlyAmount,
      monthlyTotalAmount: roundMoney(quantity * monthlyAmount),
      selfCalculatedUnitPrice,
      differenceUnitPrice: roundMoney(monthlyAmount - selfCalculatedUnitPrice),
      differenceTotalPrice: roundMoney(quantity * (monthlyAmount - selfCalculatedUnitPrice)),
      sourceType: "首次生成",
      adjustmentNo: "",
    };
  });
}

export function applyBillingAdjustment(rows: MonthlyBillingRow[], adjustment: BillingAdjustmentInput) {
  const effectiveMonth = firstDayOfMonth(adjustment.effectiveMonth);

  return rows.map((row) => {
    if (row.writeOffMonth < effectiveMonth) return row;
    const firstStage = row.monthIndex <= FIRST_STAGE_MONTHS;
    const monthlyAmount = firstStage
      ? Number(adjustment.adjustedFirst24MonthPrice ?? 0)
      : Number(adjustment.adjustedNext36MonthPrice ?? 0);

    return {
      ...row,
      instanceContractNo: adjustment.instanceContractNo?.trim() || row.instanceContractNo,
      currency: adjustment.currency?.trim() || row.currency,
      monthlyAmount,
      monthlyTotalAmount: roundMoney(Number(row.quantity ?? 0) * monthlyAmount),
      differenceUnitPrice: roundMoney(monthlyAmount - Number(row.selfCalculatedUnitPrice ?? 0)),
      differenceTotalPrice: roundMoney(Number(row.quantity ?? 0) * (monthlyAmount - Number(row.selfCalculatedUnitPrice ?? 0))),
      sourceType: "调整单" as const,
      adjustmentNo: adjustment.adjustmentNo,
    };
  });
}

export function applyBillingAdjustments(rows: MonthlyBillingRow[], adjustments: BillingAdjustmentInput[]) {
  return rows.map((row) => {
    const effectiveAdjustments = adjustments.filter(
      (adjustment) => row.writeOffMonth >= firstDayOfMonth(adjustment.effectiveMonth),
    );
    if (!effectiveAdjustments.length) return row;

    const winningAdjustment = effectiveAdjustments.toSorted((left, right) => {
      const confirmedDiff = getTime(right.confirmedAt) - getTime(left.confirmedAt);
      if (confirmedDiff !== 0) return confirmedDiff;
      return right.adjustmentNo.localeCompare(left.adjustmentNo);
    })[0];
    return applyBillingAdjustment([row], winningAdjustment)[0];
  });
}

export function firstDayOfMonth(value: string | Date) {
  const source =
    value instanceof Date
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
      : String(value).slice(0, 10);
  const date = new Date(`${source}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function addMonths(startMonth: string, offset: number) {
  const date = new Date(`${startMonth}T00:00:00`);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function getTime(value: string | Date | null | undefined) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const time = new Date(String(value).replace(" ", "T")).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function calculateSelfCalculatedUnitPrice(purchaseLine: Pick<BillingPurchaseLine, "taxExcludedUnitPrice" | "taxSurcharge" | "vatRate">) {
  return roundMoney(
    (Number(purchaseLine.taxExcludedUnitPrice ?? 0) / 88495.58 * 3978.4 + Number(purchaseLine.taxSurcharge ?? 0) / 24) *
      (1 + Number(purchaseLine.vatRate ?? 0)),
  );
}
