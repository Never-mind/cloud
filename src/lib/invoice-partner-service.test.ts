import { beforeEach, describe, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ queryRows: query }));
import { loadInvoicePartner } from "./invoice-partner-service";
import { invoicePartnerOptions } from "./invoice-partner-options";
import { partnerToInvoiceFields } from "./invoice-party-fields";
import { readApprovalPartySnapshot } from "./invoice-approval-party-snapshot";
beforeEach(() => { query.mockReset(); });
describe("invoice party selection", () => {
  it.each([["customers", "customer"], ["suppliers", "supplier"], ["undertakingUnits", "undertaking_unit"]])("looks up %s only in its own archive", async (kind, table) => {
    query.mockImplementation(async (sql: string) => sql.includes("_bank_accounts") ? [{ accountId: "bank", bankAccount: "456", bankName: "Bank", isDefault: 1 }] : sql.includes("_contacts") ? [{ phone: "123", isPrimary: 1 }] : [{ nameCn: "全称", nameEn: "Full Name", taxNumber: "TAX-2", address: "New Address" }]);
    const result = await loadInvoicePartner(kind, "partner-2");
    expect(result).toMatchObject({ id: "partner-2", name: "全称", internationalName: "Full Name", taxNumber: "TAX-2", bankAccount: "456", phone: "123" });
    expect(query.mock.calls.every(([sql, values]) => sql.includes(`merge_common_${table}`) && values.id === "partner-2")).toBe(true);
  });
  it("rejects invalid kinds without querying and deleted records without fabricating data", async () => {
    await expect(loadInvoicePartner("invoices", "id")).rejects.toThrow("类型"); expect(query).not.toHaveBeenCalled();
    query.mockResolvedValue([]); await expect(loadInvoicePartner("customers", "deleted")).rejects.toThrow("不存在");
  });
  it("does not choose an arbitrary bank when multiple accounts lack a unique default", async () => {
    query.mockImplementation(async (sql: string) => sql.includes("_bank_accounts") ? [{ bankAccount: "A" }, { bankAccount: "B" }] : sql.includes("_contacts") ? [] : [{ name: "Customer" }]);
    expect(await loadInvoicePartner("customers", "id")).toMatchObject({ bankAccount: "", warnings: [expect.stringContaining("多个银行账户")] });
  });
  it("keeps name-only labels while searching names, codes and tax IDs", () => {
    const [option] = invoicePartnerOptions([{ customerId: "id", customerCode: "C002", shortName: "简称", nameCn: "公司全称", nameEn: "English Name", taxNumber: "TAX123" }], "customers");
    expect(option.value).toBe("id"); expect(option.label).toBe("简称");
    for (const value of ["C002", "公司全称", "English Name", "TAX123"]) expect(option.keywords).toContain(value);
  });
  it("clears old details when the new partner has missing fields", () => {
    const customer = { customerName: "Old", customerTaxNumber: "OLD-TAX", customerAddress: "Old address", ...partnerToInvoiceFields("customers", { internationalName: "New" }) };
    expect(customer).toMatchObject({ customerName: "New", customerTaxNumber: "", customerAddress: "" });
    expect(partnerToInvoiceFields("undertakingUnits", {})).toMatchObject({ bankAccount: "", sellerAddress: "" });
  });
  it("keeps submitted party snapshots independent of later archive changes", () => {
    const snapshot = { customerId: "c2", undertakingUnitId: "u2", customer: { name: "At submission" }, sellerName: "Original unit", paymentTermDays: 30 };
    const saved = JSON.stringify(snapshot); snapshot.customer.name = "Later renamed";
    expect(readApprovalPartySnapshot(saved)?.customer.name).toBe("At submission");
    expect(readApprovalPartySnapshot("invalid")).toBeNull();
  });
});
