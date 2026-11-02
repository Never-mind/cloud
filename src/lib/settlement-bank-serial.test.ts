import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
vi.mock("./db", () => ({ queryRows: db.query, queryRowsRaw: db.query, execute: db.execute, executeRaw: db.execute }));
import { addSettlementSale, updateSettlementSale, addSettlementInvoice, updateSettlementInvoice } from "./settlement-project-service";

beforeEach(() => {
  vi.resetAllMocks();
  db.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM merge_po_settlement_projects p")) return [{ id: "project", status: "purchasing", exchangeRateUsd: 1, exchangeRateMxn: 1 }];
    if (sql.includes("FROM merge_po_settlement_sales WHERE id=")) return [{ id: "sale", bankSerialNo: "000Old", currency: "USD", priceType: "tax_included" }];
    if (sql.includes("FROM merge_po_settlement_invoices WHERE id=")) return [{ id: "invoice", bankSerialNo: "000Old", type: "income" }];
    return [];
  });
  db.execute.mockResolvedValue({ affectedRows: 1 });
});

it("persists text references on new sales and income invoices", async () => {
  await addSettlementSale("project", { amount: 100, bankSerialNo: " 0001-USD ", receivedAt: "2026-11-02" }, null);
  await addSettlementInvoice("project", { type: "income", invoiceTotal: 100, bankSerialNo: " 0002-USD " }, null);
  expect(db.execute.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO merge_po_settlement_sales"))?.[1].bankSerialNo).toBe("0001-USD");
  expect(db.execute.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO merge_po_settlement_invoices"))?.[1].bankSerialNo).toBe("0002-USD");
});

it("preserves references when older forms omit the field, and allows explicit clearing", async () => {
  await updateSettlementSale("project", "sale", { amount: 100 }, null);
  await updateSettlementInvoice("project", "invoice", { type: "income", invoiceTotal: 100, isPaid: true }, null);
  expect(db.execute.mock.calls.find(([sql]) => sql.startsWith("UPDATE merge_po_settlement_sales SET description"))?.[1].bankSerialNo).toBe("000Old");
  expect(db.execute.mock.calls.find(([sql]) => sql.startsWith("UPDATE merge_po_settlement_invoices SET type"))?.[1].bankSerialNo).toBe("000Old");
  db.execute.mockClear();
  await updateSettlementSale("project", "sale", { amount: 100, bankSerialNo: "" }, null);
  await updateSettlementInvoice("project", "invoice", { type: "income", invoiceTotal: 100, bankSerialNo: "" }, null);
  expect(db.execute.mock.calls.find(([sql]) => sql.startsWith("UPDATE merge_po_settlement_sales SET description"))?.[1].bankSerialNo).toBeNull();
  expect(db.execute.mock.calls.find(([sql]) => sql.startsWith("UPDATE merge_po_settlement_invoices SET type"))?.[1].bankSerialNo).toBeNull();
});
