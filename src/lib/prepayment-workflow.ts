export type PrepaymentPurchaseLine = {
  id: string;
  poNo: string;
  requestNo: string;
  countryCode?: string | null;
  batchName: string;
  requestItemId: string;
  deviceCode: string;
  modelCode?: string | null;
  nameEn?: string | null;
  quantity: number;
  currency?: string | null;
  unitPrice: number;
};

export type AvailablePrepaymentLine = PrepaymentPurchaseLine & {
  actualUnitPrice: number;
  actualTotalAmount: number;
};

export type PrepaymentContractDraft = {
  contract: {
    contractNo: string;
    status: string;
    currency: string;
    effectiveDate: string;
    totalAmount: number;
  };
  lines: PrepaymentContractLineDraft[];
};

export type PrepaymentContractLineDraft = {
  id: string;
  contractNo: string;
  lineType: "instance" | "fee";
  purchaseOrderItemId: string;
  requestItemId: string;
  batchName: string;
  requestNo: string;
  countryCode: string;
  poNo: string;
  deviceCode: string;
  modelCode: string;
  nameEn: string;
  quantity: number;
  actualCurrency: string;
  actualUnitPrice: number;
  actualTotalAmount: number;
  contractCurrency: string;
  contractUnitPrice: number;
  contractTotalAmount: number;
  writeOffStartMonth: string;
  feeName: string;
  feeDescription: string;
};

export type MonthlyWriteOffSourceLine = {
  id: string;
  contractNo: string;
  lineType: "instance" | "fee";
  batchName?: string | null;
  requestNo?: string | null;
  countryCode?: string | null;
  poNo?: string | null;
  deviceCode?: string | null;
  modelCode?: string | null;
  nameEn?: string | null;
  quantity?: number | string | null;
  contractCurrency?: string | null;
  contractTotalAmount?: number | string | null;
  writeOffStartMonth?: string | Date | null;
};

export type MonthlyWriteOffRow = {
  id: string;
  contractNo: string;
  contractLineId: string;
  writeOffMonth: string;
  monthIndex: number;
  totalMonths: number;
  currency: string;
  originalAmount: number;
  monthlyAmount: number;
  lineType: "instance" | "fee";
  batchName: string;
  requestNo: string;
  countryCode: string;
  poNo: string;
  deviceCode: string;
  modelCode: string;
  nameEn: string;
  quantity: number;
};

const WRITE_OFF_MONTHS = 24;

export function filterAvailablePrepaymentLines({
  occupiedPurchaseOrderItemIds,
  purchaseLines,
}: {
  occupiedPurchaseOrderItemIds: string[];
  purchaseLines: PrepaymentPurchaseLine[];
}): AvailablePrepaymentLine[] {
  const occupied = new Set(occupiedPurchaseOrderItemIds);
  return purchaseLines
    .filter((line) => !occupied.has(line.id))
    .map((line) => toAvailableLine(line));
}

export function summarizePrepaymentSelection(lines: PrepaymentPurchaseLine[]) {
  const availableLines = lines.map((line) => toAvailableLine(line));
  const actualTotalAmount = roundMoney(
    availableLines.reduce((total, line) => total + line.actualTotalAmount, 0),
  );

  return {
    selectedRows: availableLines.length,
    totalQuantity: availableLines.reduce((total, line) => total + Number(line.quantity ?? 0), 0),
    actualTotalAmount,
    contractTotalAmount: actualTotalAmount,
  };
}

export function buildPrepaymentDraft({
  contractNo,
  effectiveDate,
  purchaseLines,
}: {
  contractNo: string;
  effectiveDate: string;
  purchaseLines: PrepaymentPurchaseLine[];
}): PrepaymentContractDraft {
  const lines = purchaseLines.map((line, index) => {
    const available = toAvailableLine(line);
    return {
      id: `PPCI-${contractNo}-${String(index + 1).padStart(3, "0")}`,
      contractNo,
      lineType: "instance" as const,
      purchaseOrderItemId: available.id,
      requestItemId: available.requestItemId,
      batchName: available.batchName,
      requestNo: available.requestNo,
      countryCode: available.countryCode ?? "",
      poNo: available.poNo,
      deviceCode: available.deviceCode,
      modelCode: available.modelCode ?? "",
      nameEn: available.nameEn ?? "",
      quantity: Number(available.quantity ?? 0),
      actualCurrency: available.currency ?? "",
      actualUnitPrice: available.actualUnitPrice,
      actualTotalAmount: available.actualTotalAmount,
      contractCurrency: available.currency ?? "",
      contractUnitPrice: available.actualUnitPrice,
      contractTotalAmount: available.actualTotalAmount,
      writeOffStartMonth: firstDayOfMonth(effectiveDate),
      feeName: "",
      feeDescription: "",
    };
  });
  const currency = lines[0]?.contractCurrency ?? "USD";
  const totalAmount = roundMoney(lines.reduce((total, line) => total + line.contractTotalAmount, 0));

  return {
    contract: {
      contractNo,
      status: "草稿",
      currency,
      effectiveDate,
      totalAmount,
    },
    lines,
  };
}

export function buildMonthlyWriteOffRows(lines: MonthlyWriteOffSourceLine[]): MonthlyWriteOffRow[] {
  return lines.flatMap((line) => {
    const originalAmount = roundMoney(Number(line.contractTotalAmount ?? 0));
    const monthlyAmount = roundMoney(originalAmount / WRITE_OFF_MONTHS);
    const startMonth = firstDayOfMonth(line.writeOffStartMonth ?? new Date());

    return Array.from({ length: WRITE_OFF_MONTHS }, (_, index) => {
      const monthIndex = index + 1;
      const amount =
        monthIndex === WRITE_OFF_MONTHS
          ? roundMoney(originalAmount - monthlyAmount * (WRITE_OFF_MONTHS - 1))
          : monthlyAmount;

      return {
        id: `MWO-${line.id}-${String(monthIndex).padStart(3, "0")}`,
        contractNo: line.contractNo,
        contractLineId: line.id,
        writeOffMonth: addMonths(startMonth, index),
        monthIndex,
        totalMonths: WRITE_OFF_MONTHS,
        currency: line.contractCurrency ?? "",
        originalAmount,
        monthlyAmount: amount,
        lineType: line.lineType,
        batchName: line.batchName ?? "",
        requestNo: line.requestNo ?? "",
        countryCode: line.countryCode ?? "",
        poNo: line.poNo ?? "",
        deviceCode: line.deviceCode ?? "",
        modelCode: line.modelCode ?? "",
        nameEn: line.nameEn ?? "",
        quantity: Number(line.quantity ?? 0),
      };
    });
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

function toAvailableLine(line: PrepaymentPurchaseLine): AvailablePrepaymentLine {
  const actualUnitPrice = roundMoney(Number(line.unitPrice ?? 0));
  const actualTotalAmount = roundMoney(actualUnitPrice * Number(line.quantity ?? 0));
  return {
    ...line,
    actualUnitPrice,
    actualTotalAmount,
  };
}

function addMonths(startMonth: string, offset: number) {
  const date = new Date(`${startMonth}T00:00:00`);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
