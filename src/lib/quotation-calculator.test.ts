import { describe, expect, it } from "vitest";
import { calculateQuotation } from "./quotation-calculator";

describe("报价计算器", () => {
  const product = {
    productCode: "P-001",
    productName: "服务器",
    brand: "品牌A",
    length: 100,
    width: 50,
    height: 40,
    grossWeight: 20,
    tariffRate: 16,
    needNom: true,
  };

  it("使用产品主档关税率、空运体积重和固定NOM费", () => {
    const result = calculateQuotation({
      exchangeRateUsd: 10,
      capitalCostRate: 0,
      accountPeriod: 0,
      customsFeeRate: 0,
      airFreightRate: 100,
      nomFee: 700,
      markupRate: 0,
    }, [{
      productCode: "P-001",
      quantity: 2,
      purchaseCurrency: "CNY",
      purchaseUnitPrice: 1000,
      transportType: "air",
      isCustomsClearance: true,
      enableNom: true,
      product,
    }]);

    expect(result.items[0]).toMatchObject({
      purchaseTotalOriginal: 2000,
      purchaseTotalUsd: 200,
      firstMileFreightUsd: 666.6667,
      cifUsd: 866.6667,
      tariffRate: 16,
      tariffUsd: 138.6667,
      nomFeeUsd: 700,
      ddpTotalUsd: 1705.3333,
      ddpUnitPriceUsd: 852.6667,
    });
  });

  it("海运按厘米换算立方米，公共费用按CIF比例分摊", () => {
    const result = calculateQuotation({
      exchangeRateUsd: 10,
      capitalCostRate: 0,
      accountPeriod: 0,
      customsFeeRate: 0,
      seaFreightRate: 1000,
      customsMiscFee: 100,
      lastMileFee: 50,
      markupRate: 0,
    }, [
      { quantity: 1, purchaseCurrency: "USD", purchaseUnitPrice: 100, transportType: "sea", isCustomsClearance: false, product: { ...product, tariffRate: 0, needNom: false } },
      { quantity: 1, purchaseCurrency: "USD", purchaseUnitPrice: 200, transportType: "none", isCustomsClearance: false, product: { ...product, tariffRate: 0, needNom: false } },
    ]);

    expect(result.publicFeeTotal).toBe(150);
    expect(result.items[0].firstMileFreightUsd).toBe(20);
    expect(result.items[0].publicFeeAllocationUsd).toBeCloseTo(56.25, 4);
    expect(result.items[1].publicFeeAllocationUsd).toBeCloseTo(93.75, 4);
  });

  it("海外增值税和坏账率不进入报价成本，手动DDP反算加价率", () => {
    const result = calculateQuotation({
      capitalCostRate: 0,
      accountPeriod: 0,
      vatOverseas: 100,
      badDebtRate: 100,
      markupRate: 20,
    }, [{
      quantity: 1,
      purchaseCurrency: "USD",
      purchaseUnitPrice: 100,
      transportType: "none",
      isCustomsClearance: false,
      ddpQuoteUnitUsd: 150,
      product: { ...product, tariffRate: 0, needNom: false },
    }]);

    expect(result.items[0]).toMatchObject({
      ddpTotalUsd: 100,
      ddpQuoteUnitUsd: 150,
      markupRate: 50,
      revenueUsd: 150,
      operatingProfitUsd: 50,
    });
  });
});
