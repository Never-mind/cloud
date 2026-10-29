import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
vi.mock("./db", () => ({
  queryRows: db.query, queryRowsRaw: db.query, execute: db.execute, executeRaw: db.execute,
  queryRowsInTransaction: (_connection: unknown, sql: string, values: unknown) => db.query(sql, values),
  executeInTransaction: (_connection: unknown, sql: string, values: unknown) => db.execute(sql, values),
  withTransaction: async (callback: (connection: object) => Promise<unknown>) => callback({}),
}));
import { deleteServiceFeeStatementDraft, updateServiceFeeInvoiceInfo, updateServiceFeeInvoiceStatus, updateServiceFeeRepayment } from "./service-fee-service";

beforeEach(() => {
  vi.resetAllMocks();
  db.query.mockResolvedValue([{ snapshotNo: "SF-CONFIRMED", status: "已确认", confirmedAt: "2026-10-01", serviceFeeTotal: 10000 }]);
});

describe("confirmed service fee statement", () => {
  it("allows invoice information, actual partners and invoice status to be maintained", async () => {
    await updateServiceFeeInvoiceInfo("SF-CONFIRMED", {
      invoiceNo: "NEW", invoiceCurrency: "CNY", invoiceReceivingUnitId: "unit-b", invoicePayerCustomerId: "customer-b",
      invoiceAmountExcludingTax: 100, invoiceVatRate: 0.13, invoiceDate: "2026-10-28", receivableDate: "2026-11-27",
    });
    await updateServiceFeeInvoiceStatus("SF-CONFIRMED", "已开票");
    expect(db.execute.mock.calls[0][1].invoiceAmountIncludingTax).toBeCloseTo(113, 8);
    expect(db.execute.mock.calls[0][1]).toMatchObject({ invoiceNo: "NEW",
      invoiceReceivingUnitId: "unit-b", invoicePayerCustomerId: "customer-b" });
    expect(db.execute.mock.calls[1][1]).toMatchObject({ invoiceStatus: "已开票" });
    for (const [sql] of db.execute.mock.calls) expect(sql).not.toMatch(/(?:SET|,)\s*(?:status|confirmedAt|serviceFeeTotal|billingTotal|prepaymentTotal)\s*=/);
  });

  it("accepts an actual receipt smaller than the confirmed receivable", async () => {
    await updateServiceFeeRepayment("SF-CONFIRMED", {
      repaymentStatus: "未回款", receivingUnitId: "unit-b", payerCustomerId: "customer-b", repaymentCurrency: "USD",
      repaymentAmountExcludingTax: 300, repaymentVatRate: 0.06, repaymentDate: "2026-10-28",
    });
    const [sql, values] = db.execute.mock.calls[0];
    expect(values).toMatchObject({ repaymentAmount: 318, repaymentStatus: "未回款" });
    expect(sql).not.toMatch(/(?:SET|,)\s*(?:status|confirmedAt|serviceFeeTotal|invoice\w*)\s*=/);
  });

  it("keeps the confirmed statement protected from deletion", async () => {
    await expect(deleteServiceFeeStatementDraft("SF-CONFIRMED")).rejects.toThrow("不能删除或退回");
    expect(db.execute).not.toHaveBeenCalled();
  });
});
