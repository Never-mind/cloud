import { describe, expect, it } from "vitest";
import {
  applyBillingAdjustment,
  applyBillingAdjustments,
  buildBillingLedgerDraft,
  buildMonthlyBillingRows,
  buildUpdatedBillingLedgerDraft,
  findLatestInstanceContract,
  findSelectedInstanceContract,
} from "./billing-workflow";

const purchaseLine = {
  purchaseOrderItemId: "POI-001",
  countryCode: "CL",
  batchName: "CL Batch 1",
  requestNo: "REQ-001",
  poNo: "PO-001",
  deviceCode: "DEV-001",
  modelCode: "MODEL-001",
  nameEn: "Compute Node",
  quantity: 2,
  actualCurrency: "USD",
  actualUnitPrice: 800,
};

const contracts = [
  {
    contractNo: "IC-OLD",
    countryCode: "CL",
    deviceCode: "DEV-001",
    currency: "USD",
    first24MonthPrice: 450,
    next36MonthPrice: 4,
    createdAt: "2026-01-01 00:00:00",
  },
  {
    contractNo: "IC-NEW",
    countryCode: "CL",
    deviceCode: "DEV-001",
    currency: "USD",
    first24MonthPrice: 500,
    next36MonthPrice: 5,
    createdAt: "2026-06-01 00:00:00",
  },
];

describe("billing workflow", () => {
  it("finds the latest instance contract by country and device code", () => {
    expect(findLatestInstanceContract(purchaseLine, contracts)).toMatchObject({
      contractNo: "IC-NEW",
      first24MonthPrice: 500,
      next36MonthPrice: 5,
    });
  });

  it("finds the selected instance contract by contract number, country, and device code", () => {
    expect(findSelectedInstanceContract(purchaseLine, contracts, "IC-OLD")).toMatchObject({
      contractNo: "IC-OLD",
      first24MonthPrice: 450,
      next36MonthPrice: 4,
    });
    expect(findSelectedInstanceContract(purchaseLine, contracts, "IC-MISSING")).toBeNull();
  });

  it("builds a ledger draft that locks matched contract prices", () => {
    const ledger = buildBillingLedgerDraft({
      purchaseLine,
      contract: contracts[1],
      startMonth: "2026-07-01",
    });

    expect(ledger).toMatchObject({
      ledgerId: "BIL-POI-001",
      purchaseOrderItemId: "POI-001",
      instanceContractNo: "IC-NEW",
      first24MonthPrice: 500,
      next36MonthPrice: 5,
      startMonth: "2026-07-01",
      status: "核销中",
    });
  });

  it("generates 60 monthly billing rows from locked ledger prices", () => {
    const ledger = buildBillingLedgerDraft({
      purchaseLine,
      contract: contracts[1],
      startMonth: "2026-07-01",
    });
    const rows = buildMonthlyBillingRows(ledger);

    expect(rows).toHaveLength(60);
    expect(rows[0]).toMatchObject({
      id: "MBW-BIL-POI-001-001",
      writeOffMonth: "2026-07-01",
      monthIndex: 1,
      stage: "前24个月",
      monthlyAmount: 500,
      sourceType: "首次生成",
    });
    expect(rows[23]).toMatchObject({
      writeOffMonth: "2028-06-01",
      monthIndex: 24,
      stage: "前24个月",
      monthlyAmount: 500,
    });
    expect(rows[24]).toMatchObject({
      writeOffMonth: "2028-07-01",
      monthIndex: 25,
      stage: "后36个月",
      monthlyAmount: 5,
    });
    expect(rows[59]).toMatchObject({
      writeOffMonth: "2031-06-01",
      monthIndex: 60,
      stage: "后36个月",
      monthlyAmount: 5,
    });
  });

  it("applies an adjustment only from the effective month forward", () => {
    const ledger = buildBillingLedgerDraft({
      purchaseLine: {
        ...purchaseLine,
        purchaseOrderItemId: "POI-002",
        batchName: "CL Batch 2",
      },
      contract: contracts[1],
      startMonth: "2025-06-01",
    });
    const rows = buildMonthlyBillingRows(ledger);
    const adjusted = applyBillingAdjustment(rows, {
      adjustmentNo: "ADJ-001",
      effectiveMonth: "2026-08-01",
      adjustedFirst24MonthPrice: 600,
      adjustedNext36MonthPrice: 6,
    });

    expect(adjusted[13]).toMatchObject({
      writeOffMonth: "2026-07-01",
      monthIndex: 14,
      monthlyAmount: 500,
      sourceType: "首次生成",
      adjustmentNo: "",
    });
    expect(adjusted[14]).toMatchObject({
      writeOffMonth: "2026-08-01",
      monthIndex: 15,
      monthlyAmount: 600,
      sourceType: "调整单",
      adjustmentNo: "ADJ-001",
    });
    expect(adjusted[23]).toMatchObject({
      monthIndex: 24,
      monthlyAmount: 600,
    });
    expect(adjusted[24]).toMatchObject({
      monthIndex: 25,
      monthlyAmount: 6,
    });
  });

  it("applies confirmed billing adjustments by confirmed time so the latest adjustment wins", () => {
    const ledger = buildBillingLedgerDraft({
      purchaseLine: {
        ...purchaseLine,
        countryCode: "BR",
        batchName: "BR-1",
      },
      contract: {
        ...contracts[1],
        countryCode: "BR",
        currency: "BRL",
      },
      startMonth: "2026-07-01",
    });
    const rows = buildMonthlyBillingRows(ledger);
    const adjusted = applyBillingAdjustments(rows, [
      {
        adjustmentNo: "TZ2026070301",
        effectiveMonth: "2026-08-01",
        currency: "BRL",
        adjustedFirst24MonthPrice: 700,
        adjustedNext36MonthPrice: 7,
        confirmedAt: "2026-07-03 10:00:00",
      },
      {
        adjustmentNo: "TZ2026070201",
        effectiveMonth: "2026-07-01",
        currency: "BRL",
        adjustedFirst24MonthPrice: 600,
        adjustedNext36MonthPrice: 6,
        confirmedAt: "2026-07-02 10:00:00",
      },
    ]);

    expect(adjusted[0]).toMatchObject({
      writeOffMonth: "2026-07-01",
      monthlyAmount: 600,
      adjustmentNo: "TZ2026070201",
    });
    expect(adjusted[1]).toMatchObject({
      writeOffMonth: "2026-08-01",
      monthlyAmount: 700,
      monthlyTotalAmount: 1400,
      adjustmentNo: "TZ2026070301",
      sourceType: "调整单",
    });
    expect(adjusted[24]).toMatchObject({
      writeOffMonth: "2028-07-01",
      monthlyAmount: 7,
      monthlyTotalAmount: 14,
      adjustmentNo: "TZ2026070301",
    });
  });

  it("calculates monthly total amount and carries adjustment currency forward", () => {
    const ledger = buildBillingLedgerDraft({
      purchaseLine,
      contract: contracts[1],
      startMonth: "2026-07-01",
    });
    const rows = buildMonthlyBillingRows(ledger);
    const adjusted = applyBillingAdjustment(rows, {
      adjustmentNo: "ADJ-CURRENCY",
      effectiveMonth: "2026-08-01",
      currency: "CLP",
      adjustedFirst24MonthPrice: 600,
      adjustedNext36MonthPrice: 6,
    });

    expect(rows[0]).toMatchObject({
      quantity: 2,
      currency: "USD",
      monthlyAmount: 500,
      monthlyTotalAmount: 1000,
    });
    expect(rows[24]).toMatchObject({
      quantity: 2,
      currency: "USD",
      monthlyAmount: 5,
      monthlyTotalAmount: 10,
    });
    expect(adjusted[0]).toMatchObject({
      currency: "USD",
      monthlyAmount: 500,
      monthlyTotalAmount: 1000,
      adjustmentNo: "",
    });
    expect(adjusted[1]).toMatchObject({
      currency: "CLP",
      monthlyAmount: 600,
      monthlyTotalAmount: 1200,
      adjustmentNo: "ADJ-CURRENCY",
    });
    expect(adjusted[24]).toMatchObject({
      currency: "CLP",
      monthlyAmount: 6,
      monthlyTotalAmount: 12,
      adjustmentNo: "ADJ-CURRENCY",
    });
  });

  it("updates a billing ledger from the selected contract and new start month", () => {
    const currentLedger = buildBillingLedgerDraft({
      purchaseLine,
      contract: contracts[0],
      startMonth: "2026-07-01",
    });
    const updated = buildUpdatedBillingLedgerDraft({
      currentLedger: {
        ...currentLedger,
        first24MonthPrice: 999,
        next36MonthPrice: 99,
        contractCurrency: "MXN",
      },
      contract: {
        ...contracts[1],
        currency: "CLP",
      },
      startMonth: "2026-10-15",
    });
    const rows = buildMonthlyBillingRows(updated);

    expect(updated).toMatchObject({
      ledgerId: "BIL-POI-001",
      instanceContractNo: "IC-NEW",
      contractCurrency: "CLP",
      first24MonthPrice: 500,
      next36MonthPrice: 5,
      startMonth: "2026-10-01",
    });
    expect(rows).toHaveLength(60);
    expect(rows[0]).toMatchObject({
      writeOffMonth: "2026-10-01",
      currency: "CLP",
      monthlyAmount: 500,
      monthlyTotalAmount: 1000,
    });
    expect(rows[59]).toMatchObject({
      writeOffMonth: "2031-09-01",
      currency: "CLP",
      monthlyAmount: 5,
      monthlyTotalAmount: 10,
    });
  });
});
