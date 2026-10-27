import { describe, expect, it } from "vitest";
import { defaultInvoicePaymentTermDays, invoiceDueDate, resolveInvoicePaymentDates, updateInvoicePaymentDates, validateInvoicePaymentDates } from "./invoice-payment-terms";

describe("invoice payment dates", () => {
  it("calculates 30 days from the invoice date across months and years", () => {
    expect(invoiceDueDate("2026-10-21", 30)).toBe("2026-11-20");
    expect(invoiceDueDate("2026-12-20", 30)).toBe("2027-01-19");
    expect(invoiceDueDate("2028-02-01", 30)).toBe("2028-03-02");
  });

  it("uses 30 for a missing default and preserves explicit zero and custom days", () => {
    for (const value of [null, undefined, "", " ", "bad", -1, 1.2, Infinity]) expect(defaultInvoicePaymentTermDays(value)).toBe(30);
    expect(defaultInvoicePaymentTermDays(0)).toBe(0);
    expect(defaultInvoicePaymentTermDays(7)).toBe(7);
    expect(invoiceDueDate("2026-10-21", 0)).toBe("2026-10-21");
  });

  it("does not reuse a stale due date after the invoice date changes", () => {
    expect(updateInvoicePaymentDates({ invoiceDate: "2026-10-01", paymentTermDays: "30", dueDate: "2026-10-30", sourceId: "source-1" }, "invoiceDate", "2026-10-21"))
      .toEqual({ invoiceDate: "2026-10-21", paymentTermDays: "30", dueDate: "2026-11-20", sourceId: "source-1" });
  });

  it("recalculates the date when replacing a stale 1111-day term with 30", () => {
    expect(updateInvoicePaymentDates({ invoiceDate: "2026-10-21", paymentTermDays: "1111", dueDate: "2026-10-30" }, "paymentTermDays", "30"))
      .toMatchObject({ paymentTermDays: "30", dueDate: "2026-11-20" });
  });

  it("derives matching days from a manually selected due date", () => {
    const values = updateInvoicePaymentDates({ invoiceDate: "2026-10-21", paymentTermDays: "1111", dueDate: "2029-11-05" }, "dueDate", "2026-10-30");
    expect(values.paymentTermDays).toBe("9");
    expect(validateInvoicePaymentDates(values)).toBe("");
  });

  it("rejects contradictory days and due dates at save time", () => {
    expect(() => resolveInvoicePaymentDates({ invoiceDate: "2026-10-21", paymentTermDays: "1111", dueDate: "2026-10-30" }, 30)).toThrow("不一致");
    expect(resolveInvoicePaymentDates({ invoiceDate: "2026-10-21", paymentTermDays: "30" }, 1111))
      .toEqual({ paymentTermDays: 30, dueDate: "2026-11-20" });
  });

  it("derives days for older callers that explicitly supply only the due date", () => {
    expect(resolveInvoicePaymentDates({ invoiceDate: "2026-10-21", dueDate: "2026-10-30" }, 1111))
      .toEqual({ paymentTermDays: 9, dueDate: "2026-10-30" });
  });

  it("rejects invalid dates, negative days and fractional days", () => {
    for (const days of ["", "bad", "-1", "1.5"]) expect(validateInvoicePaymentDates({ invoiceDate: "2026-10-21", paymentTermDays: days, dueDate: "2026-11-20" })).not.toBe("");
    expect(invoiceDueDate("2026-02-30", 30)).toBe("");
    expect(invoiceDueDate("", 30)).toBe("");
    expect(() => resolveInvoicePaymentDates({ invoiceDate: "2026-10-21", dueDate: "2026-10-20" }, 30)).toThrow();
  });
});
