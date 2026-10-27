import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transactionQuery: vi.fn(), execute: vi.fn(), prefill: vi.fn(), read: vi.fn() }));
vi.mock("./db", () => ({
  queryRows: mocks.query,
  getDb: () => ({ getConnection: async () => ({ release: vi.fn(), destroy: vi.fn() }) }),
  queryRowsInTransaction: (_: unknown, sql: string) => mocks.transactionQuery(sql),
  executeInTransaction: (_: unknown, sql: string, params: unknown) => mocks.execute(sql, params),
  execute: vi.fn(),
}));
vi.mock("./invoice-service", () => ({ buildInvoicePrefill: mocks.prefill }));
vi.mock("./file-storage-service", () => ({ readFile: mocks.read }));
vi.mock("./feishu-message-service", () => ({ getFeishuTenantAccessToken: async () => "test-token" }));
import { APPROVAL_FIELDS as F, CHILE_INVOICE_TYPE_OPTIONS, CHILE_NOTE2_OPTIONS, submitInvoiceApprovalFromSource } from "./feishu-approval-service";

const source = { sourceType: "cloud_row" as const, sourceId: "row", starterOpenId: "ou_starter", paymentReceivedTime: "2026-11-25", amountCurrency: "USD" };
const upload = { fileName: "new.pdf", dataUrl: "data:application/pdf;base64,cGRm", isCsf: true };
let unitCode: string, definition: string;
const remoteCalls = (suffix: string) => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith(suffix));
beforeEach(() => {
  vi.resetAllMocks();
  unitCode = "MXGS01"; definition = "[]";
  mocks.prefill.mockResolvedValue({ sourceId: "row", sourceNo: "Statement", customerId: "customer", undertakingUnitId: "unit", currency: "USD", amountIncludingTax: "106", invoiceDate: "2026-10-26", lines: [] });
  mocks.query.mockImplementation(async (sql: string, params: Record<string, unknown>) => {
    if (sql.includes("FROM merge_cloud_rows")) return [{ id: "row", customerId: "customer" }];
    if (sql.includes("FROM merge_common_undertaking_units")) return [{ undertakingUnitId: "unit", undertakingUnitCode: unitCode, paymentTermDays: 30 }];
    if (sql.includes("FROM merge_common_customers")) return [{ customerId: "customer", name: "Customer", taxNumber: "TAX", taxRegime: "Regime", address: "Address", postCode: "100000" }];
    if (sql.includes("FROM merge_common_attachments")) return params.attachmentId === "foreign" ? [] : [{ attachmentId: "stored", fileName: "stored.pdf", fileSize: 3 }];
    return [];
  });
  mocks.read.mockResolvedValue({ bytes: Buffer.from("pdf") });
  mocks.transactionQuery.mockImplementation(async (sql: string) => sql.includes("GET_LOCK") ? [{ acquired: 1 }] : []);
  let count = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const data = url.endsWith("/file/upload") ? { code: `file-${++count}` }
      : url.endsWith("/instances") ? { instance_code: "instance" } : { form: definition };
    return new Response(JSON.stringify({ code: 0, data }), { headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Cloud approval material submission", () => {
  it("deduplicates existing files, uploads all materials and persists the same form tokens", async () => {
    await submitInvoiceApprovalFromSource({ ...source, cfsAttachmentId: "stored", attachmentRefs: [{ source: "customer", attachmentId: "stored", isCsf: true }], attachments: [upload] });
    const uploads = remoteCalls("/file/upload");
    expect(uploads).toHaveLength(2);
    expect(uploads.map(([, init]) => (init!.body as FormData).get("name"))).toEqual(["stored.pdf", "new.pdf"]);
    const [creation] = remoteCalls("/instances");
    const body = JSON.parse(creation[1]!.body as string);
    const expected = { id: F.customerCfs, type: "attachmentV2", value: ["file-1", "file-2"] };
    expect(body.open_id).toBe("ou_starter");
    expect(JSON.parse(body.form)).toContainEqual(expected);
    expect(JSON.parse(mocks.execute.mock.calls[0][1].formJson)).toContainEqual(expected);
    expect(mocks.read).toHaveBeenCalledOnce();
  });
  it("rejects foreign materials before uploading anything", async () => {
    await expect(submitInvoiceApprovalFromSource({ ...source, cfsAttachmentId: "foreign", attachments: [upload] })).rejects.toThrow("不属于");
    expect(remoteCalls("/file/upload")).toHaveLength(0);
    expect(remoteCalls("/instances")).toHaveLength(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("does not create or persist an approval after an upload fails", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((url, init) => String(url).endsWith("/file/upload")
      ? Promise.resolve(new Response(JSON.stringify({ code: 99991672, msg: "denied" }))) : original(url, init));
    await expect(submitInvoiceApprovalFromSource({ ...source, attachments: [upload] })).rejects.toThrow("上传审批附件失败");
    expect(remoteCalls("/instances")).toHaveLength(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([false, true])("only routes Chile materials to a visible configured widget: %s", async configured => {
    unitCode = "CLGS01";
    definition = JSON.stringify(configured ? [{ id: "chile-materials", type: "attachmentV2", name: "Materials" }] : []);
    const input = { ...source, attachments: [upload], chile: { invoiceTypeKey: CHILE_INVOICE_TYPE_OPTIONS.service.key, amountIncludingTax: 106, note1: "Service", note2Key: CHILE_NOTE2_OPTIONS.service.key, note3: 1, note4: 1 } };
    if (!configured) {
      await expect(submitInvoiceApprovalFromSource(input)).rejects.toThrow("尚未配置附件栏");
      expect(remoteCalls("/file/upload")).toHaveLength(0);
      expect(remoteCalls("/instances")).toHaveLength(0);
    } else {
      await submitInvoiceApprovalFromSource(input);
      const body = JSON.parse(remoteCalls("/instances")[0][1]!.body as string);
      expect(JSON.parse(body.form)).toContainEqual({ id: "chile-materials", type: "attachmentV2", value: ["file-1"] });
    }
  });
});
