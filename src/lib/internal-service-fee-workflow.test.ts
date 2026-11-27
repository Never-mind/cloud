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
  it("does not overwrite unusual archived amounts and reconciles the open balance", () => {
    const billingMonthlyAmounts = [...Array(24).fill(580), ...Array(36).fill(58)];
    const existingRows = buildInternalServiceFeeSchedule({ledger,billingMonthlyAmounts}).rows;
    existingRows[0] = {...existingRows[0],archived:true,internalServiceFeeAmount:-100,sourceType:'manual',adjustmentNo:'historic'};
    const result = buildInternalServiceFeeSchedule({ledger,billingMonthlyAmounts,existingRows});
    expect(result.rows[0]).toMatchObject({internalServiceFeeAmount:-100,sourceType:'manual',adjustmentNo:'historic',archived:true});
    expect(result.rows.reduce((sum,row)=>sum+row.internalServiceFeeAmount,0)).toBeCloseTo(result.internalServiceFeeTotal,2);
  });
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

  it("normalizes procurement currency and reports the management fee in USD", () => {
    const result = buildInternalServiceFeeSchedule({
      ledger: {
        ...ledger,
        quantity: 32,
        currency: "CNY",
        reportingCurrency: "USD",
        exchangeRate: 7.2,
        procurementCurrency: "USD",
        procurementToContractRate: 7.2,
        vatRate: 0.029,
        procurementTaxExcludedUnitPrice: 17058.98,
        procurementTaxSurcharge: 12997.44,
      },
      billingMonthlyAmounts: [...Array(24).fill(9688.62 * 32), ...Array(36).fill(35.4 * 32)],
    });

    expect(result.procurementCost).toBeCloseTo(6924999.17, 2);
    expect(result.internalServiceFeeTotal).toBeCloseTo(345788.93, 2);
    expect(result.rows[0].internalServiceFeeAmount).toBeCloseTo(7203.94, 2);
    expect(result.rows[0].internalServiceFeeReportingAmount).toBeCloseTo(1000.55, 2);
    expect(result.internalServiceFeeReportingTotal).toBeCloseTo(48026.24, 2);
  });
});
