export type PrepaymentMonthlyWriteOffForAdjustment = {
  id: string;
  contractNo: string;
  contractLineId: string;
  writeOffMonth: string;
  currency: string;
  monthlyAmount: number | string;
  lineType: "instance" | "fee";
  countryCode?: string | null;
  batchName?: string | null;
  requestNo?: string | null;
  poNo?: string | null;
  deviceCode?: string | null;
  modelCode?: string | null;
  nameEn?: string | null;
  quantity?: number | string | null;
};

export type PrepaymentWriteOffAdjustmentItemDraft = {
  id: string;
  adjustmentNo: string;
  monthlyWriteOffId: string;
  contractNo: string;
  contractLineId: string;
  writeOffMonth: string;
  countryCode: string;
  batchName: string;
  requestNo: string;
  poNo: string;
  deviceCode: string;
  modelCode: string;
  nameEn: string;
  quantity: number;
  currency: string;
  originalMonthlyAmount: number;
  adjustedMonthlyAmount: number;
  differenceAmount: number;
};

export type AppliedPrepaymentMonthlyWriteOff = PrepaymentMonthlyWriteOffForAdjustment & {
  monthlyAmount: number;
  sourceType: string;
  adjustmentNo: string;
};

export function buildPrepaymentWriteOffAdjustmentItems({
  adjustedAmounts,
  adjustmentNo,
  rows,
}: {
  adjustmentNo: string;
  rows: PrepaymentMonthlyWriteOffForAdjustment[];
  adjustedAmounts: Record<string, number | string>;
}): PrepaymentWriteOffAdjustmentItemDraft[] {
  return rows.map((row, index) => {
    const originalMonthlyAmount = roundMoney(Number(row.monthlyAmount ?? 0));
    const adjustedMonthlyAmount = roundMoney(Number(adjustedAmounts[row.id] ?? originalMonthlyAmount));

    return {
      id: `${adjustmentNo}-${String(index + 1).padStart(3, "0")}`,
      adjustmentNo,
      monthlyWriteOffId: row.id,
      contractNo: row.contractNo,
      contractLineId: row.contractLineId,
      writeOffMonth: row.writeOffMonth,
      countryCode: normalizeText(row.countryCode),
      batchName: normalizeText(row.batchName),
      requestNo: normalizeText(row.requestNo),
      poNo: normalizeText(row.poNo),
      deviceCode: normalizeText(row.deviceCode),
      modelCode: normalizeText(row.modelCode),
      nameEn: normalizeText(row.nameEn),
      quantity: Number(row.quantity ?? 0),
      currency: row.currency,
      originalMonthlyAmount,
      adjustedMonthlyAmount,
      differenceAmount: roundMoney(adjustedMonthlyAmount - originalMonthlyAmount),
    };
  });
}

export function applyPrepaymentWriteOffAdjustments({
  adjustmentNo,
  items,
  rows,
}: {
  adjustmentNo: string;
  rows: PrepaymentMonthlyWriteOffForAdjustment[];
  items: Array<{ monthlyWriteOffId: string; adjustedMonthlyAmount: number | string }>;
}): AppliedPrepaymentMonthlyWriteOff[] {
  const itemByWriteOffId = new Map(items.map((item) => [item.monthlyWriteOffId, item]));

  return rows.map((row) => {
    const item = itemByWriteOffId.get(row.id);
    if (!item) {
      return {
        ...row,
        monthlyAmount: roundMoney(Number(row.monthlyAmount ?? 0)),
        sourceType: "",
        adjustmentNo: "",
      };
    }

    return {
      ...row,
      monthlyAmount: roundMoney(Number(item.adjustedMonthlyAmount ?? 0)),
      sourceType: "调整单",
      adjustmentNo,
    };
  });
}

export function mergePrepaymentAdjustmentSelection({
  currentRows,
  rowsToAdd,
}: {
  currentRows: PrepaymentMonthlyWriteOffForAdjustment[];
  rowsToAdd: PrepaymentMonthlyWriteOffForAdjustment[];
}) {
  const byId = new Map(currentRows.map((row) => [row.id, row]));
  for (const row of rowsToAdd) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return Array.from(byId.values());
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
