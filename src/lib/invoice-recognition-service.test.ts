import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRows } = vi.hoisted(() => ({ queryRows: vi.fn() }));
vi.mock("./db", () => ({ queryRows }));
import { recognizeInvoiceFile } from "./invoice-recognition-service";

type Partner = Record<string, string>;
let units: Partner[];
let customers: Partner[];
let suppliers: Partner[];

function recognize(direction?: "income" | "cost", seller = "Example Issuer", sellerTax = "920000000000000002", buyer = "Example Buyer", buyerTax = "910000000000000001") {
  return recognizeInvoiceFile({ direction, fileName: "test.xml", bytes: Buffer.from(`<EInvoice>
    <Header><EINumber>26000000000000000001</EINumber><IssueTime>2026-08-17</IssueTime><InvoiceType>普通发票</InvoiceType></Header>
    <Buyer><BuyerName>${buyer}</BuyerName><BuyerIdNum>${buyerTax}</BuyerIdNum></Buyer>
    <Seller><SellerName>${seller}</SellerName><SellerIdNum>${sellerTax}</SellerIdNum></Seller>
    <Goods><GoodsName>Service</GoodsName><TaxRate>0.01</TaxRate><TaxAmount>1</TaxAmount></Goods>
    <TotalAmWithoutTax>100</TotalAmWithoutTax><TotalTax>1</TotalTax><TotalAmWithTax>101</TotalAmWithTax>
    </EInvoice>`) });
}

beforeEach(() => {
  units = [{ id: "unit-1", entityName: "Example Issuer", taxNumber: "920000000000000002" }];
  customers = [{ id: "customer-1", name: "Example Buyer", taxNumber: "910000000000000001" }];
  suppliers = [];
  queryRows.mockReset();
  queryRows.mockImplementation(async (sql: string) => {
    if (sql.includes("merge_common_undertaking_units")) return units;
    if (sql.includes("merge_common_customers")) return customers;
    if (sql.includes("merge_common_suppliers")) return suppliers;
    throw new Error("Unexpected query");
  });
});

describe("invoice business partner matching", () => {
  it("returns the freshly matched issuer's payment terms on every recognition", async () => {
    units[0].paymentTermDays = "1111";
    const old = await recognize("income");
    expect(old.partyMatches?.issuerUnit.paymentTermDays).toBe("1111");
    units[0].paymentTermDays = "30";
    const updated = await recognize("income");
    expect(updated.partyMatches?.issuerUnit.paymentTermDays).toBe("30");
    expect(old.partyMatches?.issuerUnit.paymentTermDays).toBe("1111");
  });

  it("defaults a matched unit with no configured payment terms to 30 days", async () => {
    const result = await recognize("income");
    expect(result.partyMatches?.issuerUnit.paymentTermDays).toBe("30");
  });

  it("matches both income parties by tax number even if invoice names differ", async () => {
    const result = await recognize("income", "Different Seller", undefined, "Different Buyer");
    expect(result.form).toMatchObject({ type: "income", companyEntityId: "unit-1", invoiceEntityId: "customer-1" });
    expect(result.partyMatches?.issuerUnit).toMatchObject({ status: "matched", via: "税号", name: "Example Issuer" });
    expect(result.matches?.receiverCustomerId).toBe("customer-1");
  });

  it("matches cost invoice issuer to supplier and receiver to undertaking unit", async () => {
    units = [{ id: "unit-2", name: "Our Buyer", taxNumber: "910000000000000001" }];
    suppliers = [{ id: "supplier-1", name: "Supplier", taxNumber: "920000000000000002" }];
    const result = await recognize();
    expect(result.form).toMatchObject({ type: "cost", companyEntityId: "unit-2", invoiceEntityId: "supplier-1", invoiceEntityType: "supplier" });
    expect(result.matches).toMatchObject({ issuerSupplierId: "supplier-1", receiverUnitId: "unit-2" });
  });

  it.each(["name", "nameCn", "nameEn", "shortName", "entityName"])("matches an exact %s with blank tax number", async key => {
    customers = [{ id: "customer-2", [key]: "Example Buyer", taxNumber: "" }];
    const result = await recognize("income");
    expect(result.partyMatches?.receiverCustomer).toMatchObject({ id: "customer-2", status: "matched", via: "名称" });
  });

  it("normalizes whitespace, punctuation, case and full-width characters", async () => {
    customers = [{ id: "customer-2", nameEn: "Ｅxample Buyer, Ltd.", taxNumber: "" }];
    const result = await recognize("income", undefined, undefined, "example buyer ltd");
    expect(result.matches?.receiverCustomerId).toBe("customer-2");
  });

  it("does not arbitrarily select duplicate tax numbers even if one name is exact", async () => {
    customers.push({ id: "customer-2", name: "Another Buyer", taxNumber: "910000000000000001" });
    const result = await recognize("income");
    expect(result.matches?.receiverCustomerId).toBe("");
    expect(result.partyMatches?.receiverCustomer).toMatchObject({ status: "ambiguous", via: "税号" });
    expect(result.partyMatches?.receiverCustomer.candidates).toHaveLength(2);
    expect(result.warnings.join(" ")).toContain("税号重复");
  });

  it("leaves duplicate names for manual choice", async () => {
    customers = [{ id: "a", name: "Example Buyer" }, { id: "b", nameEn: "Example Buyer" }];
    const result = await recognize("income");
    expect(result.partyMatches?.receiverCustomer).toMatchObject({ status: "ambiguous", id: "" });
  });

  it("does not match a name when the known tax number contradicts the invoice", async () => {
    customers[0].taxNumber = "DIFFERENT-TAX";
    const result = await recognize("income");
    expect(result.matches?.receiverCustomerId).toBe("");
    expect(result.partyMatches?.receiverCustomer.status).toBe("tax_conflict");
    expect(result.warnings.join(" ")).toContain("税号与档案不一致");
  });

  it("reports multiple partial-name candidates instead of picking the first", async () => {
    customers = [{ id: "a", name: "Example Buyer North" }, { id: "b", name: "Example Buyer South" }];
    const result = await recognize("income");
    expect(result.partyMatches?.receiverCustomer).toMatchObject({ status: "ambiguous", id: "" });
  });

  it("keeps unrecognized parties empty", async () => {
    const result = await recognize("income", "", "", "", "");
    expect(result.matches?.issuerUnitId).toBe("");
    expect(result.matches?.receiverCustomerId).toBe("");
    expect(result.partyMatches?.issuerUnit.status).toBe("unmatched");
  });
});
