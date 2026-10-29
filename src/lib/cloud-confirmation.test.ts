import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock("./db", () => ({
  queryRows: db.query, queryRowsRaw: db.query, executeRaw: db.execute,
  queryRowsInTransaction: (_connection: unknown, sql: string, values: unknown) => db.query(sql, values),
  executeInTransaction: (_connection: unknown, sql: string, values: unknown) => db.execute(sql, values),
  withTransaction: db.transaction,
}));
import { deleteCloudRow, importCloudWorkbook, updateCloudRow } from "./cloud-service";
import { pickCloudFinancialFields } from "./cloud-row-edit-policy";

const original = {
  id: "confirmed-row", period: "202610", account: "account-a", customer: "Business Customer", confirmed: 1,
  confirmedAt: "2026-10-01 10:00:00", confirmedByUserId: "confirmer",
  supplierPayableNetAmount: 600, customerReceivableNetAmount: 1000, settlementGrossProfit: 400,
  invoiceNetAmount: 100, invoiceTaxRate: 0.13, invoiceTaxAmount: 13, invoiceTotalAmount: 113,
  collectionNetAmount: 100, collectionTaxRate: 0.13, collectionTaxAmount: 13, collectionTotalAmount: 113,
};
let row: Record<string, unknown>;
beforeEach(() => {
  vi.resetAllMocks();
  row = { ...original };
  db.transaction.mockImplementation(async (callback: (connection: object) => Promise<unknown>) => callback({}));
  db.query.mockImplementation(async (sql: string) => /FROM merge_cloud_rows WHERE/.test(sql) ? [{ ...row }] : []);
  db.execute.mockImplementation(async (sql: string, values: Record<string, unknown>) => {
    if (sql.startsWith("UPDATE merge_cloud_rows SET")) {
      for (const [, field, param] of sql.matchAll(/`?(\w+)`? = :(\w+)/g)) if (field !== "id") row[field] = values[param];
    }
    return { affectedRows: 1 };
  });
});

function workbook() {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([
    { period: "202610", account: "account-a", customer: "Business Customer", customerReceivableNetAmount: 9999 },
  ]), "账单");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

describe("confirmed cloud statement financial maintenance", () => {
  it("saves invoice edits and recalculates invoice tax without changing the confirmed bill", async () => {
    const result = await updateCloudRow("confirmed-row", {
      invoiceNo: "INV-NEW", invoiceNetAmount: 200, invoiceCurrency: "CNY", invoiceExchangeRate: 7.1,
      invoicePayerCustomerId: "invoice-customer-b", invoicePayeeUndertakingUnitId: "invoice-unit-b",
      invoiceDate: "2026-10-28", receivableDate: "2026-11-27", collectionInvoice: "issued",
    }, null);
    expect(result).toMatchObject({ ...original, invoiceNo: "INV-NEW", invoiceNetAmount: 200, invoiceTaxAmount: 26,
      invoiceTotalAmount: 226, invoiceCurrency: "CNY", invoicePayerCustomerId: "invoice-customer-b", collectionInvoice: "issued" });
    expect(db.query.mock.calls.some(([sql]) => sql.includes("merge_cloud_supplier_payments"))).toBe(false);
    expect(db.query.mock.calls.some(([sql]) => sql.endsWith("FOR UPDATE"))).toBe(true);
    const [sql] = db.execute.mock.calls[0];
    expect(sql).not.toMatch(/(?:SET|,)\s*(?:confirmed\w*|supplier\w*|customerReceivable\w*|settlementGrossProfit)\s*=/);
  });

  it("saves partial receipts and recalculates their tax independently", async () => {
    const result = await updateCloudRow("confirmed-row", {
      collectionNetAmount: 300, collectionTaxRate: 0.06, collectionDate: "2026-10-28",
      collectionPayerCustomerId: "paying-customer", collectionPayeeUndertakingUnitId: "receiving-unit", collected: 0,
    }, null);
    expect(result).toMatchObject({ ...original, collectionNetAmount: 300, collectionTaxRate: 0.06,
      collectionTaxAmount: 18, collectionTotalAmount: 318, collected: 0 });
  });

  it("allows status changes without resetting amounts or confirmation metadata", async () => {
    expect(await updateCloudRow("confirmed-row", { collected: 1, collectionInvoice: "issued" }, null))
      .toMatchObject({ ...original, collected: 1, collectionInvoice: "issued" });
  });

  it.each(["customerReceivableNetAmount", "supplierPayableNetAmount", "customerTaxRate", "supplierTaxRate",
    "catalogAmount", "voucherCustomerAmount", "period", "account", "customerId", "undertakingUnitId",
    "collectionEntity", "settlementGrossProfit", "confirmed", "confirmedAt", "invoiceUnexpectedField"])(
    "rejects a mixed financial patch containing protected field %s before writing", async (field) => {
      await expect(updateCloudRow("confirmed-row", { invoiceNo: "NEW", [field]: "changed" }, null)).rejects.toThrow("账单金额及明细已锁定");
      expect(db.execute).not.toHaveBeenCalled();
    },
  );

  it("does not treat a string zero as confirmed and only confirms through the dedicated endpoint", async () => {
    row.confirmed = "0";
    await updateCloudRow("confirmed-row", { customerReceivableNetAmount: 1200, confirmed: 1 }, null);
    expect(row.customerReceivableNetAmount).toBe(1200);
    expect(row.confirmed).toBe("0");
  });

  it("only submits collection fields, excluding invoice state and similarly named billing fields", () => {
    expect(pickCloudFinancialFields({ collectionNetAmount: 1, collected: 1, collectionInvoice: "not_issued",
      collectionEntity: "locked", collectionPayerCustomerName: "display only", confirmed: 1 }, "collection"))
      .toEqual({ collected: 1, collectionNetAmount: 1 });
    expect(pickCloudFinancialFields({ invoiceNo: "NEW", collectionInvoice: "issued", receivableDate: "2026-11-27",
      invoicePayerCustomerName: "display only", customerReceivableNetAmount: 1000 }, "invoice"))
      .toEqual({ collectionInvoice: "issued", invoiceNo: "NEW", receivableDate: "2026-11-27" });
  });
});

describe("confirmed cloud bill protection across other entry points", () => {
  it("rejects deletion before touching either the bill or its attachments", async () => {
    await expect(deleteCloudRow("confirmed-row")).rejects.toThrow("不能删除");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("still permits deleting an unconfirmed bill", async () => {
    row.confirmed = 0;
    await deleteCloudRow("confirmed-row");
    expect(db.execute.mock.calls.filter(([sql]) => sql.startsWith("DELETE")).map(([sql]) => sql))
      .toEqual([expect.stringContaining("merge_cloud_attachments"), expect.stringContaining("merge_cloud_rows")]);
  });

  it("skips confirmed bills on import and returns their period and account", async () => {
    const result = await importCloudWorkbook(workbook(), "confirmed.xlsx", "202610", null);
    expect(result).toMatchObject({ created: 0, updated: 0, skippedConfirmed: [{ period: "202610", account: "account-a" }] });
    expect(db.execute.mock.calls.some(([sql]) => /(?:UPDATE|INSERT INTO) merge_cloud_rows/.test(sql))).toBe(false);
  });

  it("rechecks confirmation under a row lock if the bill was confirmed during import", async () => {
    db.query.mockImplementation(async (sql: string) => /FROM merge_cloud_rows WHERE/.test(sql)
      ? [{ ...original, confirmed: sql.endsWith("FOR UPDATE") ? 1 : 0 }] : []);
    const result = await importCloudWorkbook(workbook(), "race.xlsx", "202610", null);
    expect(result).toMatchObject({ updated: 0, skippedConfirmed: [{ period: "202610", account: "account-a" }] });
    expect(db.execute.mock.calls.some(([sql]) => sql.startsWith("UPDATE merge_cloud_rows"))).toBe(false);
  });

  it("still imports changes into an unconfirmed bill", async () => {
    row.confirmed = 0;
    const result = await importCloudWorkbook(workbook(), "draft.xlsx", "202610", null);
    expect(result).toMatchObject({ created: 0, updated: 1, skippedConfirmed: [] });
    expect(row.customerReceivableNetAmount).toBe(9999);
    expect(row.confirmed).toBe(0);
  });
});
