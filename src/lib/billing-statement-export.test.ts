import { describe, expect, it } from "vitest";
import { buildPrettyStatementWorkbook } from "./billing-statement-service";
import type { BillingStatementRow } from "./billing-statement-workflow";

const rows: BillingStatementRow[] = [
  {
    countryCode: "BR",
    currency: "CNY",
    instanceContractNo: "FPA-BR-CNY",
    productType: "Compute CNY",
    unitPriceVatExcluded: 100,
    vatRate: 0.029,
    unitPriceVatIncluded: 102.9,
    quantity: 5,
    amount: 514.5,
    startTime: "2026-04-01",
    endTime: "2026-04-30",
    sourceIds: "1",
  },
  {
    countryCode: "BR",
    currency: "CNY",
    instanceContractNo: "FPA-BR-CNY",
    productType: "Compute CNY Extra",
    unitPriceVatExcluded: 150,
    vatRate: 0.029,
    unitPriceVatIncluded: 154.35,
    quantity: 24,
    amount: 3704.4,
    startTime: "2026-04-01",
    endTime: "2026-04-30",
    sourceIds: "1-2",
  },
  {
    countryCode: "BR",
    currency: "USD",
    instanceContractNo: "FPA-BR-USD",
    productType: "Compute USD",
    unitPriceVatExcluded: 200,
    vatRate: 0.029,
    unitPriceVatIncluded: 205.8,
    quantity: 4,
    amount: 823.2,
    startTime: "2026-04-01",
    endTime: "2026-04-30",
    sourceIds: "2",
  },
];

describe("billing statement export workbook", () => {
  it("renders template-like merged sections for every currency", () => {
    const workbook = buildPrettyStatementWorkbook({ countryCode: "BR", rows });
    const worksheet = workbook.getWorksheet("对账表");

    expect(worksheet).toBeTruthy();
    expect(worksheet?.getCell("A1").value).toBe("HK WANZHONG TECHNOLOGY LIMITED");
    expect(worksheet?.getCell("A2").value).toBe("Computing Service Statement");
    expect(worksheet?.getCell("A4").value).toBe("Reconciliation Details");
    expect(worksheet?.getCell("F5").value).toBe("AMOUNT in CNY");
    expect(worksheet?.getCell("A19").value).toBe("Reconciliation Details");
    expect(worksheet?.getCell("F20").value).toBe("AMOUNT in USD");
    expect(worksheet?.getCell("C6").numFmt).toBe("#,##0.00");
    expect(worksheet?.getCell("D6").numFmt).toBe("#,##0.00");
    expect(worksheet?.getCell("E6").numFmt).toBe("0");
    expect(worksheet?.getCell("F6").numFmt).toBe("#,##0.00");
    expect((worksheet?.getCell("H6").value as Date).toISOString().slice(0, 10)).toBe("2026-04-01");
    expect((worksheet?.getCell("I6").value as Date).toISOString().slice(0, 10)).toBe("2026-04-30");
    expect(worksheet?.getColumn(1).width).toBe(42.38);
    expect(worksheet?.getRow(1).height).toBe(37);
    expect(worksheet?.getRow(6).height).toBe(28);
    expect(worksheet?.getCell("A4").fill).toEqual(expect.objectContaining({ fgColor: { argb: "FFC0C0C0" } }));
    expect(worksheet?.getCell("A5").fill).toBeUndefined();
    expect(worksheet?.getCell("A6").border).toEqual(expect.objectContaining({ top: expect.any(Object) }));
    expect(worksheet?.getCell("A1").isMerged).toBe(true);
    expect(worksheet?.getCell("A4").isMerged).toBe(true);
    expect(worksheet?.getCell("A6").isMerged).toBe(true);
    expect(worksheet?.getCell("A7").isMerged).toBe(true);
    expect(worksheet?.getCell("A19").isMerged).toBe(true);
  });
});
