import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), transactional: vi.fn(), queryTransaction: vi.fn(), writes: [] as Array<{ sql: string; values: Record<string, unknown> }>, committed: false, rolledBack: false }));
vi.mock("./db", () => ({
  queryRowsRaw: db.query, executeRaw: db.execute,
  queryRowsInTransaction: (_connection: unknown, sql: string, values: Record<string, unknown>) => db.queryTransaction(sql, values),
  executeInTransaction: (_connection: unknown, sql: string, values: Record<string, unknown>) => db.transactional(sql, values),
  withTransaction: async (callback: (connection: object) => Promise<void>) => { try { await callback({}); db.committed = true; } catch (error) { db.rolledBack = true; throw error; } },
}));
vi.mock("./file-storage-service", () => ({ storeFile: vi.fn(async () => ({ provider: "db", storageKey: null, fileName: "Inv_test.pdf" })), deleteFileObject: vi.fn(), readFile: vi.fn() }));
vi.mock("./invoice-pdf", () => ({ renderInvoicePdf: vi.fn() }));
import { backfillInvoiceSourceFields, buildInvoicePrefill, saveInvoice, voidInvoice } from "./invoice-service";
const input = { source: "external" as const, sourceType: "cloud_row" as const, sourceId: "row-1", invoiceNo: "TEST-1", invoiceDate: "2026-10-23", dueDate: "2026-12-10", period: "202609", customerId: "customer-1", undertakingUnitId: "unit-1", currency: "CNY", exchangeRate: "7.12345678", amountExcludingTax: "100", taxRate: "13", taxAmount: "12.99", amountIncludingTax: "112.99", file: { fileName: "test.pdf", fileType: "application/pdf", bytes: Buffer.from("test") } };
beforeEach(() => {
  vi.clearAllMocks(); db.writes = []; db.committed = false; db.rolledBack = false;
  db.query.mockImplementation(async (sql: string) => sql.includes("FROM merge_cloud_rows") ? [{ id: "row-1" }] : sql.includes("FROM merge_common_customers WHERE") ? [{ name: "Customer" }] : sql.includes("FROM merge_common_undertaking_units WHERE") ? [{ name: "Unit" }] : []);
  db.queryTransaction.mockImplementation(async (sql: string) => sql.includes("FROM merge_cloud_rows") ? [{ id: "row-1" }] : []);
  db.execute.mockImplementation(async (sql: string, values: Record<string, unknown>) => { db.writes.push({ sql, values }); });
  db.transactional.mockImplementation(async (sql: string, values: Record<string, unknown>) => { db.writes.push({ sql, values }); });
});
describe("external invoice persistence", () => {
  it("does not label USD receivables as CNY when only an invoice currency has been entered", async () => {
    db.query.mockImplementation(async (sql: string) => sql.includes("FROM merge_cloud_rows") ? [{ id: "row-1", collectionCurrency: "USD", invoiceCurrency: "CNY", invoiceNetAmount: "700", invoiceExchangeRate: "7", invoiceTaxRate: "0.13", customerReceivableNetAmount: "100", customerReceivableTotalAmount: "106", customerTaxRate: "0.06" }] : []);
    const result = await buildInvoicePrefill({ sourceType: "cloud_row", sourceId: "row-1" });
    expect(result).toMatchObject({ currency: "USD", amountExcludingTax: "100.00", amountIncludingTax: "106.00", taxRate: "6", exchangeRate: "" });
  });
  it("saves a CNY invoice without changing the USD receivable amounts or currency", async () => {
    await saveInvoice({ ...input, amountExcludingTax: "700", taxRate: "6", taxAmount: "42", amountIncludingTax: "742", exchangeRate: "" });
    const invoice = db.writes.find(item => item.sql.includes("INSERT INTO merge_common_invoices"));
    expect(invoice?.values).toMatchObject({ currency: "CNY", amountIncludingTax: "742.00", amountExcludingTax: "700.00", exchangeRate: null });
    const source = db.writes.find(item => item.sql.includes("UPDATE merge_cloud_rows"));
    expect(source?.values).toMatchObject({ currency: "CNY", net: "700.00", taxAmount: "42.00", total: "742.00" });
    expect(source?.sql).not.toContain("customerReceivable");
    expect(source?.sql).not.toContain("collectionCurrency =");
    expect(source?.sql).toContain("THEN COALESCE(:exchangeRate, invoiceExchangeRate) ELSE :exchangeRate END");
  });
  it("uses the approved allocation set even when the chronological primary row differs", async () => {
    const rows = [
      { id: "row-1", period: "202610", customerReceivableNetAmount: "100", customerReceivableTotalAmount: "112.99", invoiceCurrency: "CNY" },
      { id: "row-2", period: "202609", customerReceivableNetAmount: "100", customerReceivableTotalAmount: "113", invoiceCurrency: "CNY" },
    ];
    db.query.mockImplementation(async (sql: string, values: Record<string, unknown>) => sql.includes("FROM merge_cloud_rows") ? rows.filter(row => row.id === values.id)
      : sql.includes("FROM merge_common_customers WHERE") ? [{ name: "Customer" }]
      : sql.includes("FROM merge_common_undertaking_units WHERE") ? [{ name: "Unit" }] : []);
    db.queryTransaction.mockImplementation(async (sql: string, values: Record<string, unknown>) => {
      if (sql.includes("FROM merge_common_feishu_approvals")) return [{ status: "approved", ownerType: "cloud_row", ownerId: "row-1", allocationSourceIds: "row-1,row-2" }];
      if (sql.includes("FROM merge_common_invoice_approval_files")) return [{ id: "file-1" }];
      return sql.includes("FROM merge_cloud_rows") ? rows.filter(row => row.id === values.id) : [];
    });
    await saveInvoice({ ...input, amountExcludingTax: "200", taxRate: "12.995", taxAmount: "25.99", amountIncludingTax: "225.99", allocationSourceIds: ["row-1", "row-2"] }, {}, { fileId: "file-1", instanceCode: "instance", relatedFileIds: ["file-1"] });
    expect(db.committed).toBe(true);
    expect(db.writes.find(item => item.sql.includes("INSERT INTO merge_common_invoices"))?.values).toMatchObject({ sourceId: "row-2", taxRate: "12.995", amountIncludingTax: "225.99" });
    const allocations = db.writes.filter(item => item.sql.includes("INSERT INTO merge_common_invoice_allocations"));
    expect(allocations.map(item => item.values.total)).toEqual(["113.00", "112.99"]);
  });
  it("commits the review, approval link, source and invoice in one transaction", async () => {
    db.queryTransaction.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM merge_common_feishu_approvals")) return [{ status: "approved", ownerType: "cloud_row", ownerId: "row-1" }];
      if (sql.includes("FROM merge_common_invoice_approval_files")) return [{ id: "file-1" }];
      return sql.includes("FROM merge_cloud_rows") ? [{ id: "row-1" }] : [];
    });
    await saveInvoice(input, { userId: "user" }, { fileId: "file-1", instanceCode: "instance", relatedFileIds: ["file-1", "file-2"] });
    expect(db.committed).toBe(true);
    expect(db.writes.some(item => item.sql.includes("SET approvalInstanceCode"))).toBe(true);
    expect(db.writes.find(item => item.sql.includes("confirmedJson"))?.values.fileIds).toEqual(["file-1", "file-2"]);
  });
  it.each(["pending", "canceled", "rejected"])("never posts a %s approval", async status => {
    db.queryTransaction.mockResolvedValue([{ status }]);
    await expect(saveInvoice(input, {}, { fileId: "file-1", instanceCode: "instance", relatedFileIds: ["file-1"] })).rejects.toThrow("审批");
    expect(db.writes).toHaveLength(0); expect(db.rolledBack).toBe(true);
  });
  it("rejects a second confirmation without overwriting the first invoice", async () => {
    db.queryTransaction.mockResolvedValue([{ status: "approved", invoiceId: "old" }]);
    await expect(saveInvoice(input, {}, { fileId: "file-1", instanceCode: "instance", relatedFileIds: ["file-1"] })).rejects.toThrow("已有正式发票");
    expect(db.writes).toHaveLength(0);
  });
  it("saves the reviewed 30-day due date even if the unit previously had 1111 days", async () => {
    db.query.mockImplementation(async (sql: string) => sql.includes("FROM merge_cloud_rows") ? [{ id: "row-1" }] : sql.includes("FROM merge_common_customers WHERE") ? [{ name: "Customer" }] : sql.includes("FROM merge_common_undertaking_units WHERE") ? [{ name: "Unit", paymentTermDays: "1111" }] : []);
    await saveInvoice({ ...input, invoiceDate: "2026-10-21", paymentTermDays: "30", dueDate: "2026-11-20" });
    const invoice = db.writes.find(item => item.sql.includes("INSERT INTO merge_common_invoices"));
    expect(invoice?.values).toMatchObject({ paymentTermDays: 30, invoiceDate: "2026-10-21", dueDate: "2026-11-20" });
    const source = db.writes.find(item => item.sql.includes("UPDATE merge_cloud_rows"));
    expect(source?.values.dueDate).toBe("2026-11-20");
  });

  it("rejects a stale term paired with a nine-day due date before any writes", async () => {
    await expect(saveInvoice({ ...input, invoiceDate: "2026-10-21", paymentTermDays: "1111", dueDate: "2026-10-30" })).rejects.toThrow("不一致");
    expect(db.writes).toHaveLength(0);
  });

  it("backfills confirmed dates, parties, precise FX and actual tax atomically", async () => {
    await saveInvoice(input);
    expect(db.committed).toBe(true);
    const invoice = db.writes.find(item => item.sql.includes("INSERT INTO merge_common_invoices"));
    expect(invoice?.values).toMatchObject({ period: "202609", exchangeRate: "7.12345678", taxAmount: "12.99", amountIncludingTax: "112.99" });
    const source = db.writes.find(item => item.sql.includes("UPDATE merge_cloud_rows"));
    expect(source?.values).toMatchObject({ invoiceDate: "2026-10-23", dueDate: "2026-12-10", unitId: "unit-1", customerId: "customer-1", taxAmount: "12.99", taxRate: "0.13" });
    expect(db.writes.some(item => item.sql.includes("INSERT INTO merge_cloud_attachments"))).toBe(true);
  });
  it("rolls back when source attachment persistence fails", async () => {
    db.transactional.mockImplementation(async (sql: string) => { if (sql.includes("INSERT INTO merge_cloud_attachments")) throw new Error("attachment failed"); });
    await expect(saveInvoice(input)).rejects.toThrow("attachment failed");
    expect(db.rolledBack).toBe(true); expect(db.committed).toBe(false);
  });
  it("saves an undertaking unit maintained only under its current entityName field", async () => {
    db.query.mockImplementation(async (sql: string) => sql.includes("FROM merge_cloud_rows") ? [{ id: "row-1" }]
      : sql.includes("FROM merge_common_customers WHERE") ? [{ name: "Customer" }]
      : sql.includes("FROM merge_common_undertaking_units WHERE") ? [{ name: "", nameCn: "", nameEn: "", entityName: "Registered Unit" }] : []);
    await saveInvoice(input);
    const invoice = db.writes.find(item => item.sql.includes("INSERT INTO merge_common_invoices"));
    expect(invoice?.values).toMatchObject({ undertakingUnitId: "unit-1", sellerName: "Registered Unit", customerId: "customer-1" });
  });
  it("rejects repeated source and unallocated external multi-period invoices", async () => {
    await expect(saveInvoice({ ...input, allocationSourceIds: ["a", "b"] })).rejects.toThrow("分摊");
    db.queryTransaction.mockImplementation(async () => [{ id: "already-issued" }]);
    await expect(saveInvoice(input)).rejects.toThrow("已开票");
    expect(db.writes).toHaveLength(0);
  });
  it("keeps service-fee invoice and receivable dates independent", async () => {
    await backfillInvoiceSourceFields({ sourceType: "service_fee", sourceId: "fee-1", invoiceNo: "TEST", invoiceDate: "2026-10-23", dueDate: "2026-12-10", amountExcludingTax: 100, taxAmount: 12.99, amountIncludingTax: 112.99 });
    expect(db.writes[0].sql).toContain("invoiceDate = :invoiceDate");
    expect(db.writes[0].sql).toContain("receivableDate = COALESCE(:dueDate, receivableDate)");
    expect(db.writes[0].values).toMatchObject({ invoiceDate: "2026-10-23", dueDate: "2026-12-10" });
  });
  it.each([0, 0.5, 1, 0.1234])("preserves %s percent without rounding to a money precision", async rate => {
    await saveInvoice({ ...input, taxRate: String(rate), taxAmount: String(rate), amountIncludingTax: String(100 + rate) });
    const invoice = db.writes.find(item => item.sql.includes("INSERT INTO merge_common_invoices"));
    expect(invoice?.values.taxRate).toBe(String(rate));
    const source = db.writes.find(item => item.sql.includes("UPDATE merge_cloud_rows"));
    expect(Number(source?.values.taxRate)).toBeCloseTo(rate / 100, 6);
  });
  it("rejects missing partner records and nonfinite FX before persisting", async () => {
    await expect(saveInvoice({ ...input, exchangeRate: "Infinity" })).rejects.toThrow("汇率");
    db.query.mockResolvedValue([]);
    await expect(saveInvoice({ ...input, sourceType: "manual" })).rejects.toThrow("档案不存在");
    expect(db.writes).toHaveLength(0);
  });
  it.each(["service_fee", "settlement_invoice"])("unlinks the %s attachment when voided while retaining the invoice file", async sourceType => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, invoiceNo, status")) return [{ id: "invoice-1", invoiceNo: "TEST", sourceType, sourceId: "source-1", status: "issued" }];
      if (sql.includes("SELECT sourceAttachmentId")) return [{ sourceAttachmentId: "attachment-1" }];
      return [];
    });
    await voidInvoice("invoice-1", "test");
    const attachment = db.writes.find(item => item.sql.startsWith("DELETE FROM"));
    expect(attachment?.sql).toContain(sourceType === "service_fee" ? "merge_cloud_attachments" : "merge_po_settlement_attachments");
    expect(attachment?.values).toMatchObject({ attachmentId: "attachment-1", sourceId: "source-1" });
    expect(db.writes.some(item => item.sql.includes("fileContent = NULL"))).toBe(false);
  });
});
