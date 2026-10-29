import { describe, expect, it } from "vitest";
import {
  aggregateNewInstancesByCountryMonth,
  aggregateServiceFeesByCountryMonthCurrency,
  aggregateCloudFinancials,
  buildServiceFeeChartSeries,
  buildServiceFeeView,
  buildCloudFinancialView,
  normalizeDashboardMonth,
  recentDashboardMonths,
} from "./dashboard-workflow";

describe("homepage service fees", () => {
  it("converts calculated BR CNY fees into USD and combines with original USD", () => {
    const input = [
      { writeOffMonth: "2026-07-01", countryCode: "BR", serviceFeeCurrency: "CNY", serviceFeeAmount: 72000 },
      { writeOffMonth: "2026-07-18", countryCode: "BR", serviceFeeCurrency: "USD", serviceFeeAmount: 2000 },
      { writeOffMonth: "2026-08-01", countryCode: "MX", currency: "MXN", serviceFeeAmount: -5 },
    ];
    const before = structuredClone(input);
    const rows = aggregateServiceFeesByCountryMonthCurrency(input, (month, source, target) => month === "2026-07" && source === "CNY" && target === "USD" ? 1 / 7.2 : null);
    expect(rows).toEqual([
      { countryCode: "BR", month: "2026-07", currency: "USD", serviceFeeTotal: 12000, status: "ready", conversion: [
        { currency: "CNY", amount: 72000, rateToUsd: 1 / 7.2 },
        { currency: "USD", amount: 2000, rateToUsd: 1 },
      ] },
      { countryCode: "MX", month: "2026-08", currency: "MXN", serviceFeeTotal: -5, status: "ready" },
    ]);
    expect(input).toEqual(before);
  });

  it("uses the saved fee currency first, then billing currency, avoiding double conversion", () => {
    const rows = aggregateServiceFeesByCountryMonthCurrency([
      { writeOffMonth: "2026-07", countryCode: " br ", serviceFeeCurrency: "usd", billingCurrency: "CNY", currency: "CNY", prepaymentCurrency: "CNY", serviceFeeAmount: 100, fxStatus: "converted" },
      { writeOffMonth: "2026-07", countryCode: "BR", billingCurrency: "USD", currency: "CNY", serviceFeeAmount: 25 },
    ], () => { throw Error("USD must not be converted again"); });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ currency: "USD", serviceFeeTotal: 125, status: "ready" });
  });

  it("does not present partial USD totals as complete when a BR rate is missing", () => {
    const rows = aggregateServiceFeesByCountryMonthCurrency([
      { writeOffMonth: "2026-07", countryCode: "BR", serviceFeeCurrency: "USD", serviceFeeAmount: 100 },
      { writeOffMonth: "2026-07", countryCode: "BR", serviceFeeCurrency: "CNY", serviceFeeAmount: 700 },
      { writeOffMonth: "2026-08", countryCode: "BR", serviceFeeCurrency: "USD", serviceFeeAmount: 200 },
      { writeOffMonth: "2026-08", countryCode: "MX", serviceFeeCurrency: "MXN", serviceFeeAmount: 50 },
    ]);
    expect(rows[0]).toMatchObject({ status: "missing_rate", serviceFeeTotal: null });
    const view = buildServiceFeeView(rows);
    expect(view.rows[0].total).toEqual({ status: "missing_rate", serviceFeeTotal: null });
    expect(view.totalsByCurrency).toEqual([
      { currency: "MXN", serviceFeeTotal: 50, status: "ready" },
      { currency: "USD", serviceFeeTotal: null, status: "missing_rate" },
    ]);
  });

  it.each([null, "", "bad", Number.NaN, undefined])("keeps missing/invalid fee %s distinct from zero", (amount) => {
    const [row] = aggregateServiceFeesByCountryMonthCurrency([{ writeOffMonth: "2026-07", countryCode: "BR", currency: "USD", serviceFeeAmount: amount }]);
    expect(row).toMatchObject({ serviceFeeTotal: null, status: "missing_fee" });
  });

  it("keeps uncalculated snapshots pending, but preserves real zeros and negative fees", () => {
    const rows = aggregateServiceFeesByCountryMonthCurrency([
      { writeOffMonth: "2026-06", countryCode: "BR", serviceFeeCurrency: "USD", serviceFeeAmount: 0, fxStatus: "missing" },
      { writeOffMonth: "2026-07", countryCode: "BR", serviceFeeCurrency: "USD", serviceFeeAmount: 0, fxStatus: "same" },
      { writeOffMonth: "2026-08", countryCode: "BR", serviceFeeCurrency: "CNY", serviceFeeAmount: -720 },
    ], () => 1 / 7.2);
    expect(rows.map((row) => row.serviceFeeTotal)).toEqual([null, 0, -100]);
    expect(rows[0].status).toBe("missing_fee");
  });

  it.each([0, -1, Infinity, NaN])("rejects invalid conversion rate %s", (rate) => {
    const [row] = aggregateServiceFeesByCountryMonthCurrency([{ writeOffMonth: "2026-07", countryCode: "BR", currency: "CNY", serviceFeeAmount: 700 }], () => rate);
    expect(row).toMatchObject({ serviceFeeTotal: null, status: "missing_rate" });
  });

  it("shows three consecutive months across years and excludes historical-only countries", () => {
    const rows = aggregateServiceFeesByCountryMonthCurrency([
      { writeOffMonth: "2025-05", countryCode: "OLD", currency: "CNY", serviceFeeAmount: 999 },
      { writeOffMonth: "2025-11", countryCode: "BR", currency: "USD", serviceFeeAmount: 100 },
      { writeOffMonth: "2026-01", countryCode: "BR", currency: "USD", serviceFeeAmount: 120 },
    ]);
    expect(buildServiceFeeChartSeries(rows)).toEqual({
      months: ["2025-11", "2025-12", "2026-01"],
      series: [{ key: "BR-USD", label: "BR / USD", values: [100, null, 120] }],
    });
    expect(buildServiceFeeView(rows).totalsByCurrency).toEqual([{ currency: "USD", serviceFeeTotal: 220, status: "ready" }]);
    expect(buildServiceFeeChartSeries(rows, 0).months).toHaveLength(9);
    expect(buildServiceFeeChartSeries([])).toEqual({ months: [], series: [] });
  });

  it("aggregates new instances without changing the existing counting rule", () => {
    expect(aggregateNewInstancesByCountryMonth([
      { monthSource: "2026-07-03T08:00:00.000Z", countryCode: "BR", quantity: 2 },
      { monthSource: "2026-07-22", countryCode: "BR", quantity: "3" },
      { monthSource: "2026-08-01", countryCode: "MX", quantity: 4 },
    ])).toEqual([
      { countryCode: "BR", month: "2026-07", instanceQuantity: 5 },
      { countryCode: "MX", month: "2026-08", instanceQuantity: 4 },
    ]);
  });

  it("keeps negative BR fees visible alongside CL and MX when BR has no snapshot in the latest month", () => {
    const rows = aggregateServiceFeesByCountryMonthCurrency([
      { writeOffMonth: "2026-07", countryCode: "BR", serviceFeeCurrency: "CNY", serviceFeeAmount: -140000 },
      { writeOffMonth: "2026-08", countryCode: "BR", serviceFeeCurrency: "CNY", serviceFeeAmount: -280000 },
      { writeOffMonth: "2026-09", countryCode: "CL", currency: "USD", serviceFeeAmount: 25000 },
      { writeOffMonth: "2026-08", countryCode: "MX", currency: "USD", serviceFeeAmount: 28000 },
    ], () => 1 / 7);
    expect(buildServiceFeeChartSeries(rows)).toEqual({
      months: ["2026-07", "2026-08", "2026-09"],
      series: [
        { key: "BR-USD", label: "BR / USD", values: [-20000, -40000, null] },
        { key: "CL-USD", label: "CL / USD", values: [null, null, 25000] },
        { key: "MX-USD", label: "MX / USD", values: [null, 28000, null] },
      ],
    });
  });
});

describe("cloud net receivables and saved profit", () => {
  it("normalizes periods and adds accounts, preserving manually saved profit", () => {
    const rows = [
      { period: "202607", customerId: "A", customer: "客户A", customerReceivableNetAmount: 100, customerReceivableTotalAmount: 106, settlementGrossProfit: -10, grossProfit: 50 },
      { period: "2026-07", customerId: "A", customer: "客户A", customerReceivableNetAmount: 50, customerReceivableTotalAmount: 53, settlementGrossProfit: 5 },
      { period: "2026-09", customerId: "A", customer: "客户A", customerReceivableNetAmount: 0, customerReceivable: 99, settlementGrossProfit: 0, grossProfit: 88 },
      { period: "2026-09", customerId: "B", customer: "客户B", customerReceivable: 200, grossProfit: 20 },
      { period: "2026-04", customerId: "OLD", customer: "旧客户", customerReceivable: 999, grossProfit: 999 },
    ];
    const before = structuredClone(rows);
    const financials = aggregateCloudFinancials(rows);
    const view = buildCloudFinancialView(financials);
    expect(view.months).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(view.rows.map((row) => row.key)).toEqual(["id:B", "id:A"]);
    expect(view.monthTotals).toEqual([{ receivableNet: 150, profitNet: -5 }, null, { receivableNet: 200, profitNet: 20 }]);
    expect(view.total).toEqual({ receivableNet: 350, profitNet: 15 });
    const selected = buildCloudFinancialView(financials, "", "", "id:A");
    expect(selected.rows).toHaveLength(1);
    expect(selected.monthTotals).toEqual([{ receivableNet: 150, profitNet: -5 }, null, { receivableNet: 0, profitNet: 0 }]);
    expect(selected.total).toEqual(selected.rows[0].total);
    expect(buildCloudFinancialView(financials, "2026-04", "2026-09").total).toEqual({ receivableNet: 1349, profitNet: 1014 });
    expect(rows).toEqual(before);
  });

  it("does not substitute tax-inclusive totals for missing net receivables", () => {
    const rows = [
      { period: "2026-09", customer: "客户", customerReceivableTotalAmount: 106, settlementGrossProfit: 5 },
      { period: "2026-09", customer: "客户", customerReceivableNetAmount: 100, settlementGrossProfit: 5 },
    ];
    expect(buildCloudFinancialView(aggregateCloudFinancials(rows)).total).toEqual({ receivableNet: null, profitNet: 10 });
  });

  it("does not merge two distinct customer IDs sharing a display name", () => {
    const financials = aggregateCloudFinancials([
      { period: "202609", customerId: "A", customer: "同名", customerReceivable: 10, grossProfit: 1 },
      { period: "202609", customerId: "B", customer: "同名", customerReceivable: 20, grossProfit: 2 },
    ]);
    expect(financials.byCustomer).toHaveLength(2);
    expect(buildCloudFinancialView(financials, "", "", "id:B").total).toEqual({ receivableNet: 20, profitNet: 2 });
  });

  it("preserves no-data vs incomplete data and supports empty filters", () => {
    const financials = aggregateCloudFinancials([{ period: "2026-01", customer: "客户", customerReceivable: 0 }]);
    const view = buildCloudFinancialView(financials);
    expect(view.months).toEqual(["2025-11", "2025-12", "2026-01"]);
    expect(view.monthTotals).toEqual([null, null, { receivableNet: 0, profitNet: null }]);
    expect(view.total).toEqual({ receivableNet: 0, profitNet: null });
    expect(buildCloudFinancialView(financials, "", "", "unknown").rows).toEqual([]);
    expect(buildCloudFinancialView().total).toBeNull();
    expect(aggregateCloudFinancials([{ period: "invalid" }])).toEqual({ months: [], byCustomer: [] });
  });
});

describe("dashboard periods", () => {
  it.each(["202607", "2026-07", "2026/7", "2026-07-01T00:00:00Z"])("normalizes %s", (value) => {
    expect(normalizeDashboardMonth(value)).toBe("2026-07");
  });
  it.each(["", "invalid", "202613", "2026-00", "2026-071", "0000-01"])("ignores invalid period %s", (value) => {
    expect(normalizeDashboardMonth(value)).toBe("");
  });
  it("returns exactly three calendar months even with only one source month", () => {
    expect(recentDashboardMonths(["202601"])).toEqual(["2025-11", "2025-12", "2026-01"]);
    expect(recentDashboardMonths(["invalid"])).toEqual([]);
  });
});
