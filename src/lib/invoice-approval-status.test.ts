import { describe, expect, it } from "vitest";
import { invoiceApprovalStatusLabel } from "./invoice-approval-status";

describe("invoice approval display", () => {
  it("shows the completed registration instead of waiting for an invoice", () => {
    expect(invoiceApprovalStatusLabel("approved", "invoice", "issued")).toBe("审批通过已开票");
  });
  it("keeps approved applications without an issued invoice waiting", () => {
    expect(invoiceApprovalStatusLabel("approved")).toBe("审批通过待出票");
    expect(invoiceApprovalStatusLabel("approved", "invoice", "draft")).toBe("审批通过待出票");
    expect(invoiceApprovalStatusLabel("approved", "deleted-invoice", null)).toBe("审批通过待出票");
  });
  it("does not describe void invoices as issued", () => {
    expect(invoiceApprovalStatusLabel("approved", "invoice", "void")).toBe("审批通过，发票已作废");
  });
  it("preserves an unfinished or rejected approval state", () => {
    expect(invoiceApprovalStatusLabel("pending")).toBe("审批中");
    expect(invoiceApprovalStatusLabel("rejected")).toBe("已驳回");
    expect(invoiceApprovalStatusLabel("")).toBe("");
  });
});
