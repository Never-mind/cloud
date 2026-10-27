import { describe, expect, it } from "vitest";
import { approvalAttachmentUrl, collectReturnedAttachments, groupReturnedInvoices, recognizedInvoiceIdentity, type ReturnFileSummary } from "./invoice-approval-returns";
import type { InvoiceRecognition } from "./invoice-recognition-service";
const recognition = (amount = "106") => ({ facts: { invoiceNo: "26952000001212553711", issuerTaxNumber: "TAX-U", amountIncludingTax: amount } }) as InvoiceRecognition;
const file = (id: string, extension: string, result: InvoiceRecognition | null): ReturnFileSummary => ({
  id, fileName: "invoice_26952000001212553711." + extension, invoiceIdentity: recognizedInvoiceIdentity(result), invoiceNo: result?.facts?.invoiceNo || "",
  invoiceId: "", recognition: result, recognitionError: result ? "" : "unsupported",
});
describe("approval return collection", () => {
  it("collects both comments and earlier approval nodes while ignoring application attachments", () => {
    const f = { title: "invoice.pdf", url: "https://lf9-approval-sign.feishucdn.com/a.pdf?token=x", file_size: 10 };
    const found = collectReturnedAttachments({
      task_list: [{ id: "first", node_id: "financial" }],
      timeline: [{ type: "START", files: [{ ...f, title: "application.pdf" }] }, { type: "PASS", task_id: "first", files: [f] }, { type: "PASS", task_id: "last" }],
      comment_list: [{ files: [{ ...f, url: f.url.replace("token=x", "token=y") }, { ...f, title: "invoice.ofd", url: "https://lf9-approval-sign.feishucdn.com/a.ofd" }] }],
    });
    expect(found).toHaveLength(2);
    expect(found.map(item => item.title)).toEqual(["invoice.pdf", "invoice.ofd"]);
  });
  it("rejects unsafe URLs including redirects and hostname suffix tricks", () => {
    for (const url of ["http://feishu.cn/a", "https://127.0.0.1/a", "https://feishu.cn.evil.test/a", "https://user@feishu.cn/a", "https://feishu.cn:123/a"]) {
      expect(() => approvalAttachmentUrl(url)).toThrow();
    }
  });
  it("groups PDF and failed OFD, uses parsed PDF and flags contradictory renditions", () => {
    const groups = groupReturnedInvoices([file("ofd", "ofd", null), file("pdf", "pdf", recognition())]);
    expect(groups).toHaveLength(1);
    expect(groups[0].primary.id).toBe("pdf");
    expect(groups[0].files).toHaveLength(2);
    expect(groupReturnedInvoices([file("a", "xml", recognition("105")), file("b", "pdf", recognition("106"))])[0].conflicting).toBe(true);
  });
  it("does not merge distinct invoices or unmatched files and preserves registration", () => {
    const a = file("pdf", "pdf", recognition()); a.invoiceId = "registered";
    const b = { ...file("b", "ofd", null), fileName: "other.ofd" };
    const groups = groupReturnedInvoices([a, b]);
    expect(groups).toHaveLength(2); expect(groups[0].registered).toBe(true);
  });
  it("compares amounts numerically across PDF and XML precision", () => {
    expect(groupReturnedInvoices([file("pdf", "pdf", recognition("106.00")), file("xml", "xml", recognition("106"))])[0].conflicting).toBe(false);
  });
});
