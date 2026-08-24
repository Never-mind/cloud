import { describe, expect, it } from "vitest";
import { calculateCapexOpexPricing } from "./capex-pricing-service";

describe("CAPEX/OPEX锚定价格计算", () => {
  it("墨西哥和智利保留未税USD锚定价格，不扣巴西服务税", () => {
    const result = calculateCapexOpexPricing({
      countryCode: "MX",
      deviceCode: "DEV-001",
      b6Type: "B62-A7",
      baseCapexPrice: 100000,
      exchangeRate: 0.1,
      fundingAnnualRate: 0.04,
      fundingMonths: 0,
      onsiteRmaRate: 0,
      transportClearanceRate: 0.02,
      handlingRate: 0,
      otherTaxRate: 0,
      brazilServiceTaxRate: 0.029,
    });

    expect(result).toMatchObject({
      spareScenario: "备件场景",
      fundingRatio: 0,
      capexTotal: 100000,
      ddpPrice: 102000,
      opexAmount: 2000,
      rawCapexAnchorUsd: 10000,
      rawOpexAnchorUsd: 200,
      capexAnchorUsd: 10000,
      opexAnchorUsd: 200,
    });
  });

  it("巴西按资金占用、DDP费用和2.9%服务税生成最终系统锚定价格", () => {
    const result = calculateCapexOpexPricing({
      countryCode: "BR",
      deviceCode: "DEV-002",
      b6Type: "B62-A8",
      baseCapexPrice: 100000,
      exchangeRate: 0.1,
      fundingAnnualRate: 0.04,
      fundingMonths: 2,
      onsiteRmaRate: 0,
      transportClearanceRate: 0.16,
      handlingRate: 0.09,
      otherTaxRate: 0.57,
      brazilServiceTaxRate: 0.029,
    });

    expect(result.fundingRatio).toBeCloseTo(0.0066666667, 8);
    expect(result.fundingAmount).toBe(666.6667);
    expect(result.capexTotal).toBe(100666.6667);
    expect(result.ddpPrice).toBe(193843.7334);
    expect(result.opexAmount).toBe(93177.0667);
    expect(result.rawCapexAnchorUsd).toBe(10066.6667);
    expect(result.rawOpexAnchorUsd).toBe(9317.7067);
    expect(result.capexAnchorUsd).toBe(9782.9608);
    expect(result.opexAnchorUsd).toBe(9055.1086);
  });

  it("B65 默认使用维保服务场景", () => {
    const result = calculateCapexOpexPricing({ countryCode: "CL", deviceCode: "DEV-003", b6Type: "B65" });
    expect(result.spareScenario).toBe("维保服务场景");
  });
});
