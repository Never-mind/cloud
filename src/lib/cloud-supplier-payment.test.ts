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

  it("keys a group by period + supplier id，缺失供应商时退回名称", () => {
    expect(cloudSupplierPaymentMatchKey({ period: "202601", supplierId: "supplier-1", supplierName: "甲" })).toBe("202601|id:supplier-1");
    expect(cloudSupplierPaymentMatchKey({ period: "2026-01", supplierId: "supplier-1", supplierName: "甲" })).toBe("202601|id:supplier-1");
    expect(cloudSupplierPaymentMatchKey({ period: "202601", supplierId: "", supplierName: "未匹配供应商" })).toBe("202601|name:未匹配供应商");
    expect(cloudSupplierPaymentMatchKey({ period: "202601", supplierId: null, supplierName: "甲" })).toBe("202601|name:甲");
  });

  // 回归：键里漏掉账期时，202601 的分组会匹配到 202608 的付款行，
  // UPDATE 把那一行改成 202601 就会撞唯一键 (period, supplierId)。
  it("同一供应商在不同账期必须落到不同键上", () => {
    const january = cloudSupplierPaymentMatchKey({ period: "202601", supplierId: "supplier-1" });
    const august = cloudSupplierPaymentMatchKey({ period: "202608", supplierId: "supplier-1" });

    expect(january).not.toBe(august);
    expect(january).toBe("202601|id:supplier-1");
    expect(august).toBe("202608|id:supplier-1");
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
