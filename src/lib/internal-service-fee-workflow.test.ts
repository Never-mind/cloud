import { describe, expect, it } from "vitest";
import { buildInternalServiceFeeSchedule } from "./internal-service-fee-workflow";

const ledger = {
  ledgerId: "BIL-001",
  countryCode: "MX",
  batchName: "MX-1",
  requestNo: "RQ-1",
  poNo: "PO-1",
  deviceCode: "DEV-1",
  modelCode: "MODEL-1",
  nameEn: "Instance",
  supplierId: "SUP-1",
  undertakingUnitId: "UND-1",
  customerId: "CUS-1",
  quantity: 1,
  currency: "USD",
  vatRate: 0.16,
  procurementTaxExcludedUnitPrice: 8000,
  procurementTaxSurcharge: 0,
  startMonth: "2024-01-01",
};

describe("internal service fee workflow", () => {
  it("allocates half of the initial total into each contract stage", () => {
    const result = buildInternalServiceFeeSchedule({
      ledger,
      billingMonthlyAmounts: [...Array(24).fill(580), ...Array(36).fill(58)],
    });

    expect(result.contractRevenueExcludingTax).toBe(13800);
    expect(result.internalServiceFeeTotal).toBe(5800);
    expect(result.rows[0].internalServiceFeeAmount).toBe(120.83);
    expect(result.rows[59].internalServiceFeeAmount).toBe(80.4);
    expect(result.rows.reduce((total, row) => total + row.internalServiceFeeAmount, 0)).toBeCloseTo(5800, 2);
  });

  it("keeps archived rows and manual ranges fixed while recalculating remaining rows", () => {
    const baseRows = buildInternalServiceFeeSchedule({
      ledger,
      billingMonthlyAmounts: [...Array(24).fill(580), ...Array(36).fill(58)],
    }).rows;
    baseRows.slice(0, 24).forEach((row) => { row.archived = true; });

    const result = buildInternalServiceFeeSchedule({
      ledger,
      billingMonthlyAmounts: [...Array(24).fill(580), ...Array(36).fill(58)],
      existingRows: baseRows,
      adjustments: [{ adjustmentNo: "IFS-001", startMonth: "2026-01-01", endMonth: "2026-06-01", monthlyAmount: 100 }],
      pricingAdjustments: [{ adjustmentNo: "BA-001", effectiveMonth: "2026-06-01", first24MonthlyAmount: 580, next36MonthlyAmount: 116 }],
    });

    expect(result.rows[0].internalServiceFeeAmount).toBe(120.83);
    expect(result.rows[24].internalServiceFeeAmount).toBe(100);
    expect(result.rows[30].internalServiceFeeAmount).toBeGreaterThan(100);
    expect(result.rows.reduce((total, row) => total + row.internalServiceFeeAmount, 0)).toBeCloseTo(result.internalServiceFeeTotal, 2);
  });

  it("keeps the original internal service fee before an instance contract adjustment takes effect", () => {
    const result = buildInternalServiceFeeSchedule({
      ledger,
      billingMonthlyAmounts: [...Array(24).fill(580), ...Array(36).fill(58)],
      pricingAdjustments: [{ adjustmentNo: "BA-001", effectiveMonth: "2024-03-01", first24MonthlyAmount: 3000, next36MonthlyAmount: 30 }],
    });

    expect(result.rows[0].internalServiceFeeAmount).toBe(120.83);
    expect(result.rows[1].internalServiceFeeAmount).toBe(120.83);
    expect(result.rows[2].internalServiceFeeAmount).toBeGreaterThan(120.83);
  });
});
