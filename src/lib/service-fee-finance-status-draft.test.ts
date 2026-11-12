import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), amount: 0, month: "2026-01-01", existing: false }));
vi.mock("./db", () => ({ queryRows: mock.query, queryRowsRaw: mock.query, execute: mock.execute, executeRaw: mock.execute,
  queryRowsInTransaction: (_c: unknown, sql: string, p: unknown) => mock.query(sql, p), executeInTransaction: (_c: unknown, sql: string, p: unknown) => mock.execute(sql, p),
  withTransaction: async (f: (c: object) => Promise<unknown>) => f({}),
}));
vi.mock("./billing-service", () => ({ ensureMonthlyBillingRows: vi.fn(async () => ({})) }));
vi.mock("./party-display", () => ({ attachPartyCodes: vi.fn(async rows => rows) }));
import { createServiceFeeStatementDraft } from "./service-fee-service";
import { serviceFeeFinanceStatusWriteSql } from "./service-fee-finance-status";

beforeEach(() => {
  mock.execute.mockReset();mock.query.mockReset();mock.existing = false;
  mock.query.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT serviceFeeRows.*")) return [{ countryCode: "CL", writeOffMonth: mock.month, vatRate: 0, lineType: "instance", billingCurrency: "USD", prepaymentCurrency: "USD", currency: "USD", billingAmount: 100, prepaymentAmount: 100 - mock.amount, serviceFeeAmount: mock.amount, serviceFeeAmountExcludingTax: mock.amount, fxStatus: "same" }];
    if (sql.includes("SELECT snapshotNo, status FROM servicefeesnapshots")) return mock.existing ? [{ snapshotNo: "SF", status: "未确认" }] : [];
    return [];
  });
});

describe("draft status persistence", () => {
  it.each([[0, "2026-01-01"], [-0.03, "2026-02-01"], [0.9999, "2026-03-01"], [1, "2026-04-01"], [-1, "2026-05-01"]] as const)("generates correct stored statuses for %s", async (amount, month) => {
    mock.amount = amount;mock.month = month;
    await createServiceFeeStatementDraft({ filters: { countryCode: "CL", currency: "USD", startMonth: month } });
    const [sql, p] = mock.execute.mock.calls.find(([sql]) => sql.includes("INSERT INTO servicefeesnapshots"))!;
    expect(p.invoiceStatus).toBe(Math.abs(amount) < 1 ? "无需开票" : "未开票");
    expect(p.repaymentStatus).toBe(Math.abs(amount) < 1 ? "无需回款" : "未回款");
    expect(sql).toContain(":invoiceStatus, :repaymentStatus");
  });

  it("regeneration reevaluates stored flags after updating the fee total", async () => {
    mock.amount = 100;mock.month = "2026-06-01";mock.existing = true;
    await createServiceFeeStatementDraft({ snapshotNo: "SF", filters: { countryCode: "CL", currency: "USD", startMonth: mock.month } });
    const [sql] = mock.execute.mock.calls.find(([sql]) => sql.includes("INSERT INTO servicefeesnapshots"))!;
    expect(sql.indexOf("serviceFeeTotal = VALUES(serviceFeeTotal)")).toBeLessThan(sql.indexOf("invoiceStatus = "));
    expect(sql).toContain(`invoiceStatus = ${serviceFeeFinanceStatusWriteSql("invoiceStatus")}`);
    expect(sql).toContain(`repaymentStatus = ${serviceFeeFinanceStatusWriteSql("repaymentStatus")}`);
  });
});
