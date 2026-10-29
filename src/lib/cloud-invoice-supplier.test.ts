import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
vi.mock("./db", () => ({ queryRowsRaw: db.query, executeRaw: db.execute, queryRows: db.query, execute: db.execute }));
import { updateCloudSupplierPayment } from "./cloud-service";
beforeEach(() => {
  vi.resetAllMocks();
  db.query.mockImplementation(async (sql: string) => sql.includes("FROM merge_common_suppliers") ? [{ id: "actual-supplier", name: "Actual Supplier" }] : sql.startsWith("SELECT * FROM merge_cloud_supplier_payments WHERE id") ? [{ id: "payment", supplierId: "business-supplier", supplierName: "Business Supplier", period: "" }] : []);
});
describe("actual supplier for invoice registration", () => {
  it("saves the selected supplier without reassigning the business payable group", async () => {
    await updateCloudSupplierPayment("payment", { invoiceSupplierId: "actual-supplier", invoiceSupplierName: "forged", invoiceNo: "INV-1" }, null);
    const [sql, values] = db.execute.mock.calls.find(([sql]) => sql.startsWith("UPDATE merge_cloud_supplier_payments"))!;
    expect(values).toMatchObject({ invoiceSupplierId: "actual-supplier", invoiceSupplierName: "Actual Supplier", invoiceNo: "INV-1" });
    expect(sql).not.toMatch(/(?:SET|,) supplierId =/);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("COALESCE(NULLIF(invoiceSupplierId, ''), supplierId)"), expect.objectContaining({ supplierId: "actual-supplier" }));
  });
  it("validates supplier IDs before any write", async () => {
    db.query.mockResolvedValue([]);
    await expect(updateCloudSupplierPayment("payment", { invoiceSupplierId: "missing" }, null)).rejects.toThrow("不存在");
    expect(db.execute).not.toHaveBeenCalled();
  });
  it("snapshots the business supplier when registering an invoice with the default party", async () => {
    db.query.mockImplementation(async (sql: string) => sql.includes("FROM merge_common_suppliers") ? [{ id: "business-supplier", name: "Business Supplier" }] : sql.startsWith("SELECT * FROM merge_cloud_supplier_payments WHERE id") ? [{ id: "payment", supplierId: "business-supplier", supplierName: "Business Supplier", period: "" }] : []);
    await updateCloudSupplierPayment("payment", { invoiceNo: "DEFAULT-INV" }, null);
    const [, values] = db.execute.mock.calls.find(([sql]) => sql.startsWith("UPDATE merge_cloud_supplier_payments"))!;
    expect(values).toMatchObject({ invoiceSupplierId: "business-supplier", invoiceSupplierName: "Business Supplier" });
  });
});
