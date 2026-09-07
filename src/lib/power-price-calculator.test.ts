import { describe, expect, it } from "vitest";
import { DEFAULT_POWER_CONTRACT_EXCHANGE_RATE, buildPowerPricingSnapshot, calculatePowerServicePrice, getPowerPriceDefaults, normalizePowerContractExchangeRate, refreshPowerPricingSnapshot } from "./power-price-calculator";

describe("算力服务费测算", () => {
  it("uses the specified default CNY to USD contract exchange rate", () => {
    const defaults = getPowerPriceDefaults({
      countryCode: "MX",
      deviceCode: "DEV-DEFAULT",
      purchaseCurrency: "CNY",
      taxExcludedUnitPrice: 100.126,
      taxSurcharge: 0.126,
    });

    expect(DEFAULT_POWER_CONTRACT_EXCHANGE_RATE).toBe(0.147664224105783);
    expect(defaults.inputs.exchangeRate).toBe(DEFAULT_POWER_CONTRACT_EXCHANGE_RATE);
    expect(defaults.inputs.capexWithoutVatCny).toBe(100.25);
  });

  it("CNY采购直接以不含税单价加税费加成作为CAPEX", () => {
    const defaults = getPowerPriceDefaults({
      countryCode: "MX",
      b6Type: "B62-A7",
      deviceCode: "DEV-1",
      purchaseCurrency: "CNY",
      taxExcludedUnitPrice: 23418.9251,
      taxSurcharge: 0,
    });

    expect(defaults.inputs.capexWithoutVatCny).toBe(23418.93);
    expect(defaults.inputs.fundingMonths).toBe(0);
    expect(defaults.inputs.serviceVatRate).toBe(0.16);
  });

  it("USD采购按整机价转合同汇率反算人民币CAPEX", () => {
    const defaults = getPowerPriceDefaults({
      countryCode: "BR",
      b6Type: "B62-A8",
      deviceCode: "DEV-2",
      purchaseCurrency: "USD",
      taxExcludedUnitPrice: 100,
      taxSurcharge: 20,
      exchangeRate: 0.15,
    });

    expect(defaults.inputs.capexWithoutVatCny).toBe(800);
    expect(defaults.inputs.fundingMonths).toBe(2);
  });

  it("USD采购使用默认汇率将 6125 USD 换算为 41479.24 CNY", () => {
    const defaults = getPowerPriceDefaults({
      countryCode: "MX",
      deviceCode: "DEV-USD-DEFAULT",
      purchaseCurrency: "USD",
      taxExcludedUnitPrice: 6100,
      taxSurcharge: 25,
    });

    expect(defaults.inputs.exchangeRate).toBe(DEFAULT_POWER_CONTRACT_EXCHANGE_RATE);
    expect(defaults.inputs.capexWithoutVatCny).toBe(41479.24);
  });

  it("uses the default rate for empty, zero, and malformed exchange rates", () => {
    expect(normalizePowerContractExchangeRate(undefined)).toBe(DEFAULT_POWER_CONTRACT_EXCHANGE_RATE);
    expect(normalizePowerContractExchangeRate(0)).toBe(DEFAULT_POWER_CONTRACT_EXCHANGE_RATE);
    expect(normalizePowerContractExchangeRate("invalid")).toBe(DEFAULT_POWER_CONTRACT_EXCHANGE_RATE);
    expect(normalizePowerContractExchangeRate(0.15)).toBe(0.15);
  });

  it("按模板计算CAPEX、OPEX和两段含VAT服务价格", () => {
    const result = calculatePowerServicePrice({
      capexWithoutVatCny: 100000,
      onsiteRmaRate: 0,
      fundingAnnualRate: 0.04,
      fundingMonths: 0,
      transportClearanceRate: 0.02,
      handlingRate: 0,
      otherTaxRate: 0,
      exchangeRate: 0.1,
      serviceVatRate: 0.16,
      benchmarkCapexCny: 100000,
      first24BaseFeeCny: 2400,
      next36BaseFeeCny: 24,
    });

    expect(result).toMatchObject({
      capexTotalCny: 100000,
      ddpPriceCny: 102000,
      opexCny: 2000,
      first24NoVatCny: 2483.3333,
      next36NoVatCny: 24,
      first24VatIncluded: 288.07,
      next36VatIncluded: 2.78,
    });
  });

  it("刷新采购价格时保留手工参数和手工服务价格", () => {
    const first = buildPowerPricingSnapshot({
      countryCode: "CL",
      b6Type: "B62-A8",
      deviceCode: "DEV-3",
      purchaseCurrency: "CNY",
      taxExcludedUnitPrice: 100,
      taxSurcharge: 10,
    }, {
      manualInputKeys: ["fundingMonths"],
      manualInputs: { fundingMonths: 4 },
      manualPrices: { first24VatIncluded: 88.88 },
    });
    const refreshed = refreshPowerPricingSnapshot({
      countryCode: "CL",
      b6Type: "B62-A8",
      deviceCode: "DEV-3",
      purchaseCurrency: "CNY",
      taxExcludedUnitPrice: 200,
      taxSurcharge: 10,
    }, first);

    expect(refreshed.inputs.capexWithoutVatCny).toBe(210);
    expect(refreshed.inputs.fundingMonths).toBe(4);
    expect(refreshed.result.first24VatIncluded).toBe(88.88);
  });
});
