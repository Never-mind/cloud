import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboardOverview } from "./dashboard-service";
import { buildCloudFinancialView } from "./dashboard-workflow";
import { queryRows } from "./db";

vi.mock("./db", () => ({ queryRows: vi.fn() }));

describe("dashboard read-only integration", () => {
  beforeEach(() => {
    vi.mocked(queryRows).mockReset();
    vi.mocked(queryRows).mockImplementation(async (sql, params) => {
      if (!/^\s*SELECT\b/i.test(sql)) throw new Error("Dashboard must be read-only");
      if (sql.includes("FROM merge_common_exchange_rates")) return [
        { periodMonth: "2026-06", sourceCurrency: "USD", targetCurrency: "CNY", rate: "7.2" },
        { periodMonth: "2026-09", sourceCurrency: "USD", targetCurrency: "CNY", rate: "8" },
      ];
      if (sql.includes("AS writeOffMonth") && sql.includes("FROM servicefeesnapshotitems")) {
        expect(sql).toContain("serviceFeeCurrency");
        expect(sql).toContain("fxStatus");
        const rows = [
          { writeOffMonth: "2026-05-01", countryCode: "BR", serviceFeeCurrency: "CNY", serviceFeeAmount: 720 },
          { writeOffMonth: "2026-07-01", countryCode: "BR", serviceFeeCurrency: "CNY", serviceFeeAmount: 72000 },
          { writeOffMonth: "2026-07-01", countryCode: "BR", serviceFeeCurrency: "USD", serviceFeeAmount: 2000 },
          { writeOffMonth: "2026-09-01", countryCode: "BR", serviceFeeCurrency: "CNY", serviceFeeAmount: 800 },
          { writeOffMonth: "2026-07-01", countryCode: "MX", serviceFeeCurrency: "MXN", serviceFeeAmount: 500 },
        ];
        return params?.countryCode ? rows.filter((row) => row.countryCode === params.countryCode) : rows;
      }
      if (sql.includes("FROM merge_cloud_rows r")) return [
        { period: "202607", customerId: "C1", customer: "客户1", customerReceivableNetAmount: "100", settlementGrossProfit: "-5" },
        { period: "2026-07", customerId: "C1", customer: "客户1", customerReceivableNetAmount: "50", settlementGrossProfit: "1" },
      ];
      return [];
    });
  });

  it("uses monthly maintained inverse rates with prior-month fallback, never future rates", async () => {
    const data = await getDashboardOverview(new URLSearchParams());
    expect(data.serviceFees.filter((row) => row.countryCode === "BR").map((row) => [row.month, row.serviceFeeTotal, row.status])).toEqual([
      ["2026-05", null, "missing_rate"],
      ["2026-07", 12000, "ready"],
      ["2026-09", 100, "ready"],
    ]);
    expect(buildCloudFinancialView(data.portfolio.cloud.financials).total).toEqual({ receivableNet: 150, profitNet: -4 });
    expect(vi.mocked(queryRows).mock.calls.every(([sql]) => /^\s*SELECT\b/i.test(sql))).toBe(true);
  });

  it("keeps cloud customer data independent of the compute country filter", async () => {
    const data = await getDashboardOverview(new URLSearchParams({ countryCode: "MX" }));
    expect(data.serviceFees).toHaveLength(1);
    expect(data.serviceFees[0]).toMatchObject({ countryCode: "MX", currency: "MXN", serviceFeeTotal: 500 });
    expect(data.portfolio.cloud.financials.byCustomer).toHaveLength(1);
    expect(vi.mocked(queryRows).mock.calls.some(([sql]) => sql.includes("FROM merge_common_exchange_rates"))).toBe(false);
  });
});
