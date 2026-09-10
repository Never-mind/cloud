import { describe, expect, it } from "vitest";
import { calculateCloudTaxGroup } from "./cloud-tax";

describe("calculateCloudTaxGroup", () => {
  const values = {
    supplierPayableNetAmount: "100",
    supplierTaxRate: "0.16",
    supplierTaxAmount: "16",
    supplierPayableTotalAmount: "116",
  };

  it("recalculates tax and total when the net amount or rate changes", () => {
    expect(calculateCloudTaxGroup({ ...values, supplierPayableNetAmount: "200" }, "supplierPayable", ["supplierPayableNetAmount"]))
      .toMatchObject({ tax: 32, total: 232, source: "net-rate" });
    expect(calculateCloudTaxGroup({ ...values, supplierTaxRate: "13%" }, "supplierPayable", ["supplierTaxRate"]))
      .toMatchObject({ tax: 13, total: 113, source: "net-rate" });
  });

  it("recalculates the other values when tax or total is entered directly", () => {
    expect(calculateCloudTaxGroup({ ...values, supplierTaxAmount: "20" }, "supplierPayable", ["supplierTaxAmount"]))
      .toMatchObject({ tax: 20, total: 120, source: "tax" });
    expect(calculateCloudTaxGroup({ ...values, supplierPayableTotalAmount: "113" }, "supplierPayable", ["supplierPayableTotalAmount"]))
      .toMatchObject({ net: 97.41379310344828, tax: 15.586206896551715, total: 113, source: "total" });
  });

  it("uses the same rules for customer collections, invoices, and supplier payments", () => {
    expect(calculateCloudTaxGroup({ collectionNetAmount: 100, collectionTaxRate: 0.13 }, "collection", ["collectionNetAmount"])).toMatchObject({ tax: 13, total: 113 });
    expect(calculateCloudTaxGroup({ invoiceNetAmount: 100, invoiceTaxRate: 0.06 }, "invoice", ["invoiceTaxRate"])).toMatchObject({ tax: 6, total: 106 });
    expect(calculateCloudTaxGroup({ paymentNetAmount: 100, paymentTaxRate: 0.03 }, "payment", ["paymentNetAmount"])).toMatchObject({ tax: 3, total: 103 });
  });
});
