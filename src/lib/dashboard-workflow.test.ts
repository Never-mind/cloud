import { describe, expect, it } from "vitest";
import {
  aggregateNewInstancesByCountryMonth,
  aggregateServiceFeesByCountryMonthCurrency,
  buildServiceFeeChartSeries,
} from "./dashboard-workflow";

describe("dashboard workflow", () => {
  it("aggregates monthly service fees by country, month, and currency", () => {
    const rows = aggregateServiceFeesByCountryMonthCurrency([
      { writeOffMonth: "2026-07-01", countryCode: "BR", currency: "USD", serviceFeeAmount: 100 },
      { writeOffMonth: "2026-07-18", countryCode: "BR", billingCurrency: "USD", serviceFeeAmount: 25 },
      { writeOffMonth: "2026-07-01", countryCode: "BR", prepaymentCurrency: "CNY", serviceFeeAmount: 10 },
      { writeOffMonth: "2026-08-01", countryCode: "MX", currency: "MXN", serviceFeeAmount: -5 },
    ]);

    expect(rows).toEqual([
      { countryCode: "BR", month: "2026-07", currency: "CNY", serviceFeeTotal: 10 },
      { countryCode: "BR", month: "2026-07", currency: "USD", serviceFeeTotal: 125 },
      { countryCode: "MX", month: "2026-08", currency: "MXN", serviceFeeTotal: -5 },
    ]);
  });

  it("aggregates newly added instance quantity by country and month", () => {
    const rows = aggregateNewInstancesByCountryMonth([
      { monthSource: "2026-07-03T08:00:00.000Z", countryCode: "BR", quantity: 2 },
      { monthSource: "2026-07-22", countryCode: "BR", quantity: "3" },
      { monthSource: "2026-08-01", countryCode: "MX", quantity: 4 },
    ]);

    expect(rows).toEqual([
      { countryCode: "BR", month: "2026-07", instanceQuantity: 5 },
      { countryCode: "MX", month: "2026-08", instanceQuantity: 4 },
    ]);
  });

  it("builds chart series for each country and currency", () => {
    const chart = buildServiceFeeChartSeries([
      { countryCode: "BR", month: "2026-07", currency: "USD", serviceFeeTotal: 100 },
      { countryCode: "BR", month: "2026-08", currency: "USD", serviceFeeTotal: 120 },
      { countryCode: "BR", month: "2026-07", currency: "CNY", serviceFeeTotal: 80 },
      { countryCode: "MX", month: "2026-08", currency: "MXN", serviceFeeTotal: 50 },
    ]);

    expect(chart.months).toEqual(["2026-07", "2026-08"]);
    expect(chart.series).toEqual([
      { key: "BR-CNY", label: "BR / CNY", values: [80, null] },
      { key: "BR-USD", label: "BR / USD", values: [100, 120] },
      { key: "MX-MXN", label: "MX / MXN", values: [null, 50] },
    ]);
  });

  it("服务费折线图只取最近 6 个月（首页看板）", () => {
    const rows = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"].map((month) => ({
      countryCode: "BR",
      month,
      currency: "CNY",
      serviceFeeTotal: 100,
    }));

    const chart = buildServiceFeeChartSeries(rows);
    expect(chart.months).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(chart.series[0].values).toHaveLength(6);

    // 传 0 表示不限制
    expect(buildServiceFeeChartSeries(rows, 0).months).toHaveLength(8);
  });
});
