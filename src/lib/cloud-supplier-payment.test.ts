import { describe, expect, it } from "vitest";
import {
  CLOUD_SUPPLIER_PAYABLE_COLUMNS,
  cloudSupplierPaymentHasUserData,
  cloudSupplierPaymentMatchKey,
} from "./cloud-service";

describe("cloud supplier payment payable sync", () => {
  it("persists exactly the payable columns the supplier payment list displays", () => {
    expect([...CLOUD_SUPPLIER_PAYABLE_COLUMNS]).toEqual([
      "supplierPayableCurrency",
      "supplierPayableNetAmount",
      "supplierTaxRate",
      "supplierTaxAmount",
      "supplierPayableTotalAmount",
    ]);
  });

  it("does not persist the removed 应付汇率 field", () => {
    expect([...CLOUD_SUPPLIER_PAYABLE_COLUMNS]).not.toContain("supplierPayableExchangeRate");
  });

  it("keys a group by supplier id and falls back to the supplier name", () => {
    expect(cloudSupplierPaymentMatchKey({ supplierId: "supplier-1", supplierName: "甲" })).toBe("id:supplier-1");
    expect(cloudSupplierPaymentMatchKey({ supplierId: "", supplierName: "未匹配供应商" })).toBe("name:未匹配供应商");
    expect(cloudSupplierPaymentMatchKey({ supplierId: null, supplierName: "甲" })).toBe("name:甲");
  });

  it("treats a pure summary row as safe to regenerate", () => {
    expect(cloudSupplierPaymentHasUserData({
      payerUnitId: null, payerUnitName: null, currency: null, paymentExchangeRate: null, paymentNetAmount: null,
      paymentTaxRate: null, paymentTaxAmount: null, paymentTotalAmount: null, paymentDate: null, receivableDate: null,
      invoiceNo: null, invoiceCurrency: null, invoiceExchangeRate: null, invoiceNetAmount: null, invoiceTaxRate: null,
      invoiceTaxAmount: null, invoiceTotalAmount: null, invoiceDate: null, paid: 0, invoiceStatus: "not_issued",
    })).toBe(false);
  });

  it("keeps rows that already carry manual payment or invoice data", () => {
    const bare = { paid: 0, invoiceStatus: "not_issued" };
    expect(cloudSupplierPaymentHasUserData({ ...bare, currency: "USD" })).toBe(true);
    expect(cloudSupplierPaymentHasUserData({ ...bare, paymentNetAmount: 0 })).toBe(true);
    expect(cloudSupplierPaymentHasUserData({ ...bare, invoiceNo: "INV-1" })).toBe(true);
    expect(cloudSupplierPaymentHasUserData({ ...bare, paid: 1 })).toBe(true);
    expect(cloudSupplierPaymentHasUserData({ ...bare, invoiceStatus: "issued" })).toBe(true);
  });
});
