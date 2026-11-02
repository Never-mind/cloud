import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock("./db", () => ({
  queryRowsRaw: db.query, executeRaw: db.execute, executeInTransaction: db.execute,
  queryRowsInTransaction: db.query, withTransaction: db.transaction,
}));
vi.mock("./file-storage-service", () => ({ storeFile: vi.fn(), readFile: vi.fn(), deleteFileObject: vi.fn() }));
vi.mock("./invoice-pdf", () => ({ renderInvoicePdf: vi.fn() }));

import { buildInvoicePrefill, invoiceNoRule, nextInvoiceNo } from "./invoice-service";

beforeEach(() => vi.resetAllMocks());

describe("local invoice numbering", () => {
  it.each([
    { label: "starts a new period", numbers: [], expected: "WZ-202610-0001" },
    { label: "continues legacy INV numbers", numbers: ["INV-202610-0025"], expected: "WZ-202610-0026" },
    { label: "continues WZ numbers", numbers: ["WZ-202610-0026"], expected: "WZ-202610-0027" },
    { label: "uses the larger legacy sequence", numbers: ["WZ-202610-0002", "INV-202610-0025"], expected: "WZ-202610-0026" },
    { label: "uses the larger new sequence", numbers: ["INV-202610-0025", "WZ-202610-0028"], expected: "WZ-202610-0029" },
    { label: "compares sequences numerically past four digits", numbers: ["WZ-202610-9999", "INV-202610-10000"], expected: "WZ-202610-10001" },
    { label: "ignores custom suffixes and other periods", numbers: ["INV-202609-0099", "WZ-202611-0030", "INV-202610-9999-CUSTOM", "WZ-202610-1e10", "CLOUD-202610-1000", "INV-202610-0025"], expected: "WZ-202610-0026" },
  ])("$label", async ({ numbers, expected }) => {
    db.query.mockResolvedValue(numbers.map(invoiceNo => ({ invoiceNo })));
    expect(await nextInvoiceNo("202610")).toBe(expected);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("invoiceNo LIKE :legacyPrefix"), {
      prefix: "WZ-202610-%", legacyPrefix: "INV-202610-%",
    });
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("describes the new format", () => {
    expect(invoiceNoRule("202610")).toBe("WZ-202610-0001");
    expect(invoiceNoRule("")).toBe("WZ-YYYYMM-0001");
  });

  it.each([
    ["billing_statement", "merge_power_billingstatementsnapshots", { snapshotNo: "bill", endDate: "2026-10-31", totalAmount: "100" }],
    ["service_fee", "merge_power_servicefeesnapshots", { snapshotNo: "bill", writeOffMonth: "2026-10-01", serviceFeeTotal: "100" }],
    ["cloud_row", "merge_cloud_rows", { id: "bill", period: "202610", customerReceivableTotalAmount: "100" }],
    ["settlement_invoice", "merge_po_settlement_invoices", { id: "bill", accountPeriod: "2026-10-01", invoiceTotal: "100" }],
  ] as const)("prefills %s using the shared sequence and bill period", async (sourceType, table, row) => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes(`FROM ${table}`)) return [row];
      if (sql.includes("SELECT invoiceNo FROM merge_common_invoices")) return [{ invoiceNo: "INV-202610-0025" }];
      return [];
    });
    expect(await buildInvoicePrefill({ sourceType, sourceId: "bill" })).toMatchObject({
      period: "202610", suggestedInvoiceNo: "WZ-202610-0026",
    });
    expect(db.execute).not.toHaveBeenCalled();
  });
});
