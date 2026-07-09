import { describe, expect, it } from "vitest";
import {
  buildBillingStatementRows,
  getVatRate,
  groupBillingStatementRowsByCurrency,
} from "./billing-statement-workflow";

const billingRows = [
  {
    id: "MBW-1",
    countryCode: "BR",
    instanceContractNo: "FPA-BR-001",
    nameEn: "Compute A",
    quantity: 2,
    currency: "CNY",
    monthlyAmount: 102.9,
    writeOffMonth: "2026-04-01",
  },
  {
    id: "MBW-2",
    countryCode: "BR",
    instanceContractNo: "FPA-BR-001",
    nameEn: "Compute A",
    quantity: 3,
    currency: "CNY",
    monthlyAmount: 102.9,
    writeOffMonth: "2026-04-01",
  },
  {
    id: "MBW-3",
    countryCode: "BR",
    instanceContractNo: "FPA-BR-002",
    nameEn: "Compute B",
    quantity: 4,
    currency: "USD",
    monthlyAmount: 205.8,
    writeOffMonth: "2026-04-01",
  },
];

describe("billing statement workflow", () => {
  it("returns configured VAT rates by country", () => {
    expect(getVatRate("MX")).toBe(0.16);
    expect(getVatRate("CL")).toBe(0.19);
    expect(getVatRate("BR")).toBe(0.029);
  });

  it("groups monthly billing rows and calculates VAT excluded unit price", () => {
    const rows = buildBillingStatementRows({
      rows: billingRows,
      startDate: "2026-04-01",
      endDate: "2026-04-30",
    });

    expect(rows).toEqual([
      {
        countryCode: "BR",
        currency: "CNY",
        instanceContractNo: "FPA-BR-001",
        productType: "Compute A",
        unitPriceVatIncluded: 102.9,
        unitPriceVatExcluded: 100,
        vatRate: 0.029,
        quantity: 5,
        amount: 514.5,
        startTime: "2026-04-01",
        endTime: "2026-04-30",
        sourceIds: "MBW-1,MBW-2",
      },
      {
        countryCode: "BR",
        currency: "USD",
        instanceContractNo: "FPA-BR-002",
        productType: "Compute B",
        unitPriceVatIncluded: 205.8,
        unitPriceVatExcluded: 200,
        vatRate: 0.029,
        quantity: 4,
        amount: 823.2,
        startTime: "2026-04-01",
        endTime: "2026-04-30",
        sourceIds: "MBW-3",
      },
    ]);
  });

  it("splits statement rows by currency with totals", () => {
    const groups = groupBillingStatementRowsByCurrency(
      buildBillingStatementRows({
        rows: billingRows,
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      }),
    );

    expect(groups).toEqual([
      { currency: "CNY", rows: [expect.objectContaining({ currency: "CNY" })], totalQuantity: 5, totalAmount: 514.5 },
      { currency: "USD", rows: [expect.objectContaining({ currency: "USD" })], totalQuantity: 4, totalAmount: 823.2 },
    ]);
  });
});
