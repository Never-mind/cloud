import { describe, expect, it } from "vitest";
import {
  buildExchangeRateId,
  currentPeriodMonth,
  exchangeRateKey,
  lookupExchangeRate,
  normalizeExchangeRateInput,
  normalizePeriodMonth,
  prepareExchangeRateWrite,
  type ExchangeRateMap,
} from "./exchange-rate-service";
import { applyExchangeRateConversion, countUnconvertedServiceFeeRows, summarizeServiceFeeRows, type ServiceFeeRow } from "./service-fee-workflow";

function serviceFeeRow(overrides: Partial<ServiceFeeRow> = {}): ServiceFeeRow {
  return {
    id: "SFC-1",
    writeOffMonth: "2026-06-01",
    countryCode: "BR",
    batchName: "BR-30",
    requestNo: "eSHWC250609y43a",
    poNo: "PO-1",
    deviceCode: "06114119",
    requestType: "整机",
    modelCode: "M-1",
    nameEn: "Node",
    supplierId: "SUP-1",
    undertakingUnitId: "UNIT-1",
    customerId: "CUS-1",
    quantity: 4,
    currency: "CNY",
    vatRate: 0,
    billingCurrency: "CNY",
    prepaymentCurrency: "USD",
    lineType: "instance",
    billingAmount: 14969.84,
    prepaymentAmount: 2063.52,
    serviceFeeAmount: 12906.32,
    serviceFeeAmountExcludingTax: 12906.32,
    exchangeRate: null,
    prepaymentAmountConverted: 2063.52,
    serviceFeeCurrency: "CNY",
    fxStatus: "same",
    billingSourceIds: "MBW-1",
    prepaymentSourceIds: "MPW-1",
    prepaymentContractNos: "FPA-1",
    sourceNote: "月账单与预付款均存在",
    ...overrides,
  };
}

describe("exchange rate service", () => {
  it("normalizes period and currency formats", () => {
    expect(normalizePeriodMonth("2026-06")).toBe("2026-06");
    expect(normalizePeriodMonth("2026-06-01")).toBe("2026-06");
    expect(normalizePeriodMonth("2026/6")).toBe("2026-06");
    expect(normalizePeriodMonth("2026-13")).toBe("");
    expect(currentPeriodMonth(new Date("2026-06-30T16:30:00Z"))).toBe("2026-07");
  });

  it("builds a stable id from period and currency pair so re-import updates", () => {
    expect(buildExchangeRateId("2026-06", "USD", "CNY")).toBe("FXR-2026-06-USD-CNY");
    const normalized = normalizeExchangeRateInput({ periodMonth: "2026/6/1", sourceCurrency: "usd", targetCurrency: "cny", rate: 7.2545 });
    expect(normalized).toMatchObject({ id: "FXR-2026-06-USD-CNY", periodMonth: "2026-06", sourceCurrency: "USD", targetCurrency: "CNY" });
  });

  it("rejects invalid rows with readable messages", () => {
    expect(() => prepareExchangeRateWrite({ periodMonth: "2026", sourceCurrency: "USD", targetCurrency: "CNY", rate: 7 })).toThrow("账期请按 YYYY-MM 填写");
    expect(() => prepareExchangeRateWrite({ periodMonth: "2026-06", sourceCurrency: "USD", targetCurrency: "USD", rate: 7 })).toThrow("不能相同");
    expect(() => prepareExchangeRateWrite({ periodMonth: "2026-06", sourceCurrency: "USD", targetCurrency: "CNY", rate: 0 })).toThrow("大于 0");
  });

  it("falls back to the inverse currency pair", () => {
    const map: ExchangeRateMap = new Map([[exchangeRateKey("2026-06", "USD", "MXN"), 18.524]]);
    expect(lookupExchangeRate(map, "2026-06", "MXN", "USD")).toBeCloseTo(1 / 18.524, 8);
    expect(lookupExchangeRate(map, "2026-06", "USD", "CNY")).toBeNull();
  });
});

describe("service fee cross-currency conversion", () => {
  it("converts the prepayment side with the month rate before subtracting", () => {
    const rates: ExchangeRateMap = new Map([[exchangeRateKey("2026-06", "USD", "CNY"), 7.2545]]);
    const [row] = applyExchangeRateConversion([serviceFeeRow()], rates);
    expect(row.fxStatus).toBe("converted");
    expect(row.exchangeRate).toBe(7.2545);
    expect(row.prepaymentAmountConverted).toBeCloseTo(14969.81, 2);
    expect(row.serviceFeeAmount).toBeCloseTo(0.03, 2);
    expect(row.serviceFeeCurrency).toBe("CNY");
  });

  it("keeps same-currency rows untouched", () => {
    const rates: ExchangeRateMap = new Map([[exchangeRateKey("2026-06", "USD", "CNY"), 7.2545]]);
    const [row] = applyExchangeRateConversion(
      [serviceFeeRow({ billingCurrency: "USD", prepaymentCurrency: "USD", billingAmount: 8420, prepaymentAmount: 3150, serviceFeeAmount: 5270 })],
      rates,
    );
    expect(row.fxStatus).toBe("same");
    expect(row.serviceFeeAmount).toBe(5270);
    expect(row.exchangeRate).toBeNull();
  });

  it("marks rows without a maintained rate instead of subtracting different currencies", () => {
    const [row] = applyExchangeRateConversion([serviceFeeRow()], new Map());
    expect(row.fxStatus).toBe("missing");
    expect(row.serviceFeeAmount).toBe(0);
    expect(countUnconvertedServiceFeeRows([row])).toBe(1);
  });

  it("excludes unconverted rows from totals and counts the prepayment side after conversion", () => {
    const rates: ExchangeRateMap = new Map([[exchangeRateKey("2026-06", "USD", "CNY"), 7.2545]]);
    const rows = applyExchangeRateConversion(
      [
        serviceFeeRow(),
        serviceFeeRow({ id: "SFC-2", writeOffMonth: "2027-01-01", billingAmount: 14969.84, prepaymentAmount: 2063.52 }),
      ],
      rates,
    );
    const summary = summarizeServiceFeeRows(rows);
    expect(summary.billingTotal).toBeCloseTo(14969.84, 2);
    expect(summary.prepaymentTotal).toBeCloseTo(14969.81, 2);
    expect(summary.serviceFeeTotal).toBeCloseTo(0.03, 2);
  });
});
