import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), read: vi.fn() }));
vi.mock("./db", () => ({ queryRows: mocks.query }));
vi.mock("./file-storage-service", () => ({ readFile: mocks.read }));
import { listInvoiceApprovalAttachments, prepareInvoiceApprovalAttachments } from "./invoice-approval-attachment-service";
import { cloudAttachmentField, parseInvoiceAttachmentSelection, type InvoiceAttachmentSelection } from "./invoice-approval-attachments";
const context = { sourceType: "cloud_row" as const, sourceId: "row1", sourceIds: ["row1", "row2"], customerId: "customer1" };
const upload = { fileName: "new.pdf", dataUrl: "data:application/pdf;base64,cGRm" };
function sourceRows(sql: string) {
  if (sql.includes("FROM merge_cloud_rows")) return [{ id: "row1", customerId: "customer1" }, { id: "row2", customerId: "customer1" }];
  if (!sql.includes("_attachments") && ["merge_power_billingstatementsnapshots", "merge_power_servicefeesnapshots", "merge_po_settlement_invoices"].some(table => sql.includes(`FROM ${table} WHERE`))) return [{ id: "row1" }];
  return null;
}
function attachmentRows(rows: Array<Record<string, unknown>>) {
  mocks.query.mockImplementation(async (sql: string) => sourceRows(sql) ?? rows);
}
beforeEach(() => { vi.resetAllMocks(); attachmentRows([]); mocks.read.mockResolvedValue({ bytes: Buffer.from("file") }); });
describe("invoice approval attachment scopes", () => {
  it("loads the explicitly selected customer's materials while retaining source ownership validation", async () => {
    await listInvoiceApprovalAttachments({ ...context, sourceCustomerId: "customer1", customerId: "customer2" });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("ownerType = 'customers'"), { customerId: "customer2" });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("ownerId IN (:ids)"), { ids: ["row1", "row2"] });
  });
  it("lists metadata only from the current customer and selected periods", async () => {
    attachmentRows([{ attachmentId: "a", fileName: "file.pdf", fileSize: 4 }]);
    const files = await listInvoiceApprovalAttachments(context);
    expect(files.map(file => file.source)).toEqual(["customer", "cloud_row"]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("ownerType = 'customers' AND ownerId = :customerId"), { customerId: "customer1" });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("ownerId IN (:ids)"), { ids: ["row1", "row2"] });
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([
    ["billing_statement", "merge_power_billingstatement_attachments", "snapshotNo = :sourceId"],
    ["service_fee", "merge_cloud_attachments", "ownerType = 'service_fee_invoice' AND ownerId = :sourceId"],
    ["settlement_invoice", "merge_po_settlement_attachments", "invoiceId = :sourceId"],
  ] as const)("limits %s files to their source", async (sourceType, table, where) => {
    await listInvoiceApprovalAttachments({ ...context, sourceType, sourceIds: [] });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining(`FROM ${table} WHERE ${where}`), { sourceId: "row1" });
    if (sourceType === "settlement_invoice") expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("invoiceId IS NULL AND projectId IN (SELECT projectId FROM merge_po_settlement_invoices WHERE id = :sourceId)"), { sourceId: "row1" });
  });
  it.each(["customer", "cloud_row", "settlement_project"] as const)("rejects foreign or deleted %s attachments before reading content", async source => {
    await expect(prepareInvoiceApprovalAttachments(context, { attachmentRefs: [{ source, attachmentId: "foreign" }] })).rejects.toThrow("不属于");
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("deduplicates scoped references and combines them with uploads", async () => {
    attachmentRows([{ fileName: "stored.pdf", fileSize: 4 }]);
    const ref = { source: "customer" as const, attachmentId: "a", isCsf: true };
    const files = await prepareInvoiceApprovalAttachments(context, { attachmentRefs: [ref, ref], attachments: [upload] }, true);
    expect(files.map(file => file.fileName)).toEqual(["stored.pdf", "new.pdf"]);
    expect(mocks.read).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("attachmentId = :attachmentId AND ownerType = 'customers' AND ownerId = :customerId"), { customerId: "customer1", attachmentId: "a" });
  });
  it("never treats supplementary files as CSF without confirmation", async () => {
    await expect(prepareInvoiceApprovalAttachments(context, { attachments: [upload] }, true)).rejects.toThrow("CSF");
    expect(await prepareInvoiceApprovalAttachments(context, { attachments: [{ ...upload, isCsf: true }] }, true)).toHaveLength(1);
  });
  it("rejects missing stored bytes", async () => {
    attachmentRows([{ fileName: "stored.pdf" }]); mocks.read.mockResolvedValue(null);
    await expect(prepareInvoiceApprovalAttachments(context, { attachmentRefs: [{ source: "customer", attachmentId: "a" }] })).rejects.toThrow("读取失败");
  });
  it.each(["https://example.test/file.pdf", "data:application/pdf;base64,%%%", "data:application/pdf;base64,cGR", "data:application/pdf;base64,"])("rejects malformed or empty upload %s", async dataUrl => {
    await expect(prepareInvoiceApprovalAttachments(context, { attachments: [{ ...upload, dataUrl }] })).rejects.toThrow("附件内容");
  });
  it("enforces per-file and aggregate byte limits", async () => {
    attachmentRows([{ fileName: "large.pdf", fileSize: 10 * 1024 * 1024 + 1 }]);
    await expect(prepareInvoiceApprovalAttachments(context, { attachmentRefs: [{ source: "customer", attachmentId: "a" }] })).rejects.toThrow("10 MB");
    expect(mocks.read).not.toHaveBeenCalled();
    attachmentRows([{ fileName: "large.pdf", fileSize: 1 }]); mocks.read.mockResolvedValue({ bytes: Buffer.alloc(10 * 1024 * 1024) });
    await expect(prepareInvoiceApprovalAttachments(context, { attachmentRefs: ["a", "b", "c", "d"].map(attachmentId => ({ source: "customer", attachmentId })) })).rejects.toThrow("30 MB");
  });
  it("blocks mixed customers before listing or reading any attachments", async () => {
    mocks.query.mockResolvedValue([{ id: "row1", customerId: "customer1" }, { id: "row2", customerId: "other" }]);
    await expect(listInvoiceApprovalAttachments(context)).rejects.toThrow("客户不一致");
    await expect(prepareInvoiceApprovalAttachments(context, { attachments: [upload] })).rejects.toThrow("客户不一致");
    expect(mocks.query.mock.calls.every(([sql]) => sql.includes("FROM merge_cloud_rows"))).toBe(true);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("accepts a legacy customer code resolved to the same customer", async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM merge_cloud_rows")
      ? [{ id: "row1", customerId: "customer1", customerCode: "C001" }]
      : []);
    await expect(listInvoiceApprovalAttachments({ ...context, sourceIds: [], customerId: "C001" })).resolves.toEqual([]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("OR c.customerCode = COALESCE"), { ids: ["row1"] });
  });
  it("does not let an empty customer context bypass ownership checks", async () => {
    await expect(listInvoiceApprovalAttachments({ ...context, customerId: "" })).rejects.toThrow("客户不一致");
  });
  it("rejects deleted selected periods and a primary row outside the selection", async () => {
    mocks.query.mockResolvedValue([{ id: "row1", customerId: "customer1" }]);
    await expect(listInvoiceApprovalAttachments(context)).rejects.toThrow("已不存在");
    mocks.query.mockClear();
    await expect(listInvoiceApprovalAttachments({ ...context, sourceId: "foreign" })).rejects.toThrow("不在所选");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each(["billing_statement", "service_fee", "settlement_invoice"] as const)("rejects a missing %s source and unexpected merged rows", async sourceType => {
    mocks.query.mockResolvedValue([]);
    await expect(listInvoiceApprovalAttachments({ ...context, sourceType, sourceIds: [] })).rejects.toThrow("来源单据不存在");
    mocks.query.mockClear();
    await expect(listInvoiceApprovalAttachments({ ...context, sourceType })).rejects.toThrow(sourceType==="service_fee"?"已不存在":"不支持合并");
    if(sourceType!=="service_fee")expect(mocks.query).not.toHaveBeenCalled();
  });
  it("loads selected service-fee materials and rejects a foreign business customer",async()=>{
    mocks.query.mockImplementation(async(sql:string)=>sql.includes("FROM merge_power_servicefeesnapshots r")?[{snapshotNo:"row1",customerId:"customer1"},{snapshotNo:"row2",customerId:"customer1"}]:[]);
    await listInvoiceApprovalAttachments({...context,sourceType:"service_fee",customerId:"invoice-customer-B"});
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("ownerId IN (:ids)"),{ids:["row1","row2"]});
    mocks.query.mockResolvedValue([{snapshotNo:"row1",customerId:"customer1"},{snapshotNo:"row2",customerId:"other"}]);
    await expect(listInvoiceApprovalAttachments({...context,sourceType:"service_fee"})).rejects.toThrow("业务客户不一致");
  });
});
describe("attachment input and Cloud branch definitions", () => {
  it.each([ { attachmentRefs: "bad" }, { attachments: {} }, { attachmentRefs: [{ source: "unknown", attachmentId: "x" }] }, { attachments: [{ ...upload, fileName: "../file" }] } ])("rejects malformed selections", selection => {
    expect(() => parseInvoiceAttachmentSelection(selection as unknown as InvoiceAttachmentSelection)).toThrow();
  });
  it("limits attachment count", () => { expect(() => parseInvoiceAttachmentSelection({ attachments: Array(11).fill(upload) })).toThrow("10 个"); });
  it("rejects oversized inline content before decoding", () => { expect(() => parseInvoiceAttachmentSelection({ attachments: [{ ...upload, dataUrl: "a".repeat(14 * 1024 * 1024) }] })).toThrow("10 MB"); });
  it("does not route Chile files to a hidden Mexico widget", () => {
    const field = { id: "csf", name: "CSF", type: "attachmentV2", display_condition: { conditional: "OR", conditions: [{ conditional: "AND", expressions: [{ source_widget: { id: "widget17634571084590001" }, compare_type: "is", standard_value: "mx" }] }] } };
    expect(cloudAttachmentField(JSON.stringify([field]), "mx")).toEqual({ id: "csf", name: "CSF" });
    expect(cloudAttachmentField(JSON.stringify([field]), "cl")).toBeNull();
    expect(cloudAttachmentField(JSON.stringify([field, { id: "materials", name: "Materials", type: "attachmentV2", display_condition: null }]), "cl")).toEqual({ id: "materials", name: "Materials" });
  });
});
