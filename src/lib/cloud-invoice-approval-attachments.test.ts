import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transactionQuery: vi.fn(), execute: vi.fn(), prefill: vi.fn(), read: vi.fn() }));
vi.mock("./db", () => ({
  queryRows: mocks.query,
  queryRowsRaw: mocks.query,
  getDb: () => ({ getConnection: async () => ({ release: vi.fn(), destroy: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn() }) }),
  queryRowsInTransaction: (_: unknown, sql: string, params: unknown) => mocks.transactionQuery(sql, params),
  executeInTransaction: (_: unknown, sql: string, params: unknown) => mocks.execute(sql, params),
  execute: vi.fn(),
}));
vi.mock("./invoice-service", () => ({ buildInvoicePrefill: mocks.prefill }));
vi.mock("./file-storage-service", () => ({ readFile: mocks.read }));
vi.mock("./feishu-message-service", () => ({ getFeishuTenantAccessToken: async () => "test-token" }));
import { APPROVAL_FIELDS as F, CFDI_OPTIONS, CHILE_INVOICE_TYPE_OPTIONS, CHILE_NOTE2_OPTIONS, submitInvoiceApprovalFromSource } from "./feishu-approval-service";
import { loadAllocationSources } from "./invoice-allocation-service";
import { suggestInvoiceAllocations } from "./invoice-allocation";
import { applyInvoiceLineAmounts } from "./invoice-approval-allocation-amounts";

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
  it("submits the exact two confirmed MXN amounts and saves same-month account allocations despite reference FX differences",async()=>{
    const dbRows=["row","row2"].map((id,i)=>({id,period:"202610",account:`account-${i+1}`,customerId:"customer",businessCustomerId:"customer",undertakingUnitId:"unit",customerReceivableNetAmount:i?5125.47:638.95,customerReceivableTotalAmount:i?5125.47:638.95,customerTaxRate:0.16}));
    const originalQuery=mocks.query.getMockImplementation()!;
    const originalTransaction=mocks.transactionQuery.getMockImplementation()!;
    const cloudRows=(params:Record<string,unknown>)=>dbRows.filter(row=>params.id?row.id===params.id:Array.isArray(params.ids)?params.ids.includes(row.id):true);
    mocks.query.mockImplementation(async(sql:string,params:Record<string,unknown>={})=>sql.includes("FROM merge_cloud_rows")?cloudRows(params):originalQuery(sql,params));
    mocks.transactionQuery.mockImplementation(async(sql:string,params:Record<string,unknown>={})=>sql.includes("FROM merge_cloud_rows")?cloudRows(params):originalTransaction(sql,params));
    const rows=await loadAllocationSources("cloud_row",["row","row2"]);
    const invoiceLines=["11516.54","92376.13"].map((amountIncludingTax,index)=>({amountIncludingTax,invoiceContent:`Account ${index+1}`,cfdiCodeKey:CFDI_OPTIONS.G03.key,allocationSourceId:dbRows[index].id}));
    const plan=applyInvoiceLineAmounts(suggestInvoiceAllocations(rows.map(row=>({...row,suggestedRate:"18.02"})),"MXN"),invoiceLines);
    await submitInvoiceApprovalFromSource({...source,amountIncludingTax:103892.67,amountCurrency:"MXN",allocationPlan:plan,invoiceLines,attachments:[upload]});
    const body=JSON.parse(remoteCalls("/instances")[0][1]!.body as string);
    const values=JSON.parse(body.form).find((row:{id:string})=>row.id===F.invoiceInfo).value;
    expect(values.map((row:Array<{id:string;value:unknown}>)=>row.find(field=>field.id===F.amountIncludingTax)!.value)).toEqual([11516.54,92376.13]);
    const saved=mocks.execute.mock.calls.find(([sql])=>String(sql).includes("INSERT INTO merge_common_feishu_approvals"))![1];
    expect(JSON.parse(saved.allocationPlanJson).allocations.map((row:{amountIncludingTax:string;exchangeRate:string})=>[row.amountIncludingTax,row.exchangeRate])).toEqual([["11516.54","18.02"],["92376.13","18.02"]]);
  });
  it("submits and persists two real invoice rows without overriding their content", async () => {
    const invoiceLines = ["9290.82","100002.00"].map((amountIncludingTax,index) => ({amountIncludingTax,invoiceContent:`Service ${index+1}`,cfdiCodeKey:CFDI_OPTIONS.G03.key}));
    await submitInvoiceApprovalFromSource({...source, amountIncludingTax:109292.82, amountCurrency:"MXN", invoiceLines, invoiceContent:"Legacy summary", attachments:[upload]});
    const body = JSON.parse(remoteCalls("/instances")[0][1]!.body as string);
    const form = JSON.parse(body.form);
    const rows = form.find((field: {id:string}) => field.id === F.invoiceInfo).value;
    expect(rows).toEqual(invoiceLines.map(line => [
      {id:F.amountIncludingTax,type:"amount",value:Number(line.amountIncludingTax),currency:"MXN"},
      {id:F.invoiceContent,type:"input",value:line.invoiceContent},
      {id:F.cfdiCode,type:"radioV2",value:CFDI_OPTIONS.G03.key},
    ]));
    expect(JSON.parse(mocks.execute.mock.calls[0][1].formJson)).toEqual(form);
  });
  it.each(["105", "107"])("rejects detail total %s against invoice total 106 before uploading or submitting", async amountIncludingTax => {
    await expect(submitInvoiceApprovalFromSource({...source,attachments:[upload],invoiceLines:[{amountIncludingTax,invoiceContent:"Service",cfdiCodeKey:CFDI_OPTIONS.G03.key}]})).rejects.toThrow("合计");
    expect(remoteCalls("/file/upload")).toHaveLength(0); expect(remoteCalls("/instances")).toHaveLength(0); expect(mocks.execute).not.toHaveBeenCalled();
  });
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
