import { describe, expect, it } from "vitest";
import {
  calculateNonInstanceLine,
  importNonInstanceSettlementRows,
  nonInstanceSettlementColumns,
} from "./non-instance-settlement-import";

describe("non-instance settlement import", () => {
  it("maps the spare part template labels to its structured fields", () => {
    const result = importNonInstanceSettlementRows("备件结差", [{
      批次: "BR-1",
      签收时间: "2026/06/01",
      "设备不含税单价 USD": "120.5",
      结算数量: "3",
      "支付时汇率（CNY/USD）": "7.2",
      "不含税总价 USD（系统计算）": "999",
    }]);

    expect(result.failures).toEqual([]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      expenseType: "备件结差",
      differenceNature: "CAPEX",
      batchName: "BR-1",
      expenseDate: "2026-06-01",
      taxExcludedUnitPriceUsd: "120.5",
      settlementQuantity: "3",
      taxExcludedTotalUsd: "361.5",
      taxExcludedTotalCny: "2602.8",
      settlementAmountUsd: "361.5",
    });
  });

  it("calculates customs tax separately from the actual settlement amount", () => {
    const result = calculateNonInstanceLine("清关费 OPEX", {
      equipmentTotalUsd: "1000",
      localTaxRate: "16",
      feeCurrency: "MXN",
      feeAmount: "232",
      usdExchangeRate: "20",
    });

    expect(result.errors).toEqual([]);
    expect(result.values).toMatchObject({
      calculatedTaxAmountUsd: 160,
      settlementAmountUsd: 11.6,
      opexDifferenceTotal: 11.6,
    });
  });

  it("calculates cross-border financial tax after ISS", () => {
    const result = calculateNonInstanceLine("跨境业务金融税", {
      equipmentTotalUsd: "1000",
      localTaxRate: "2.9",
      issRate: "5",
      usdExchangeRate: "7.2",
    });

    expect(result.errors).toEqual([]);
    expect(result.values).toMatchObject({
      feeAmount: 29,
      issExcludedAmountUsd: 27.55,
      taxExcludedTotalCny: 198.36,
      opexDifferenceTotal: 27.55,
    });
  });

  it("converts other OPEX from its original currency to USD", () => {
    const result = calculateNonInstanceLine("人力及行政成本", {
      expenseName: "技术人员",
      expenseDate: "2026-06-01",
      feeAmount: "500",
      feeCurrency: "BRL",
      usdExchangeRate: "5",
    });

    expect(result.errors).toEqual([]);
    expect(result.values).toMatchObject({ settlementAmountUsd: 100, opexDifferenceTotal: 100 });
  });

  it("keeps the dynamic field sets separated by expense type", () => {
    expect(nonInstanceSettlementColumns("跨境业务金融税").map((column) => column.label)).toContain("ISS税率（%）");
    expect(nonInstanceSettlementColumns("人力及行政成本").map((column) => column.label)).toContain("费用明细/人员");
  });
});
