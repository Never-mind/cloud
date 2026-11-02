import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ invoices: [] as Record<string, any>[], allocations: [] as Record<string, any>[], sources: {} as Record<string, Record<string, any>>, attachments: new Map<string, Record<string, any>>(), writes: [] as string[], committed: false, failSql: "" }));
vi.mock("./db", () => {
  const query = async (sql: string, p: Record<string, any> = {}) => {
    if (sql.includes("COALESCE(a.sourceId, i.sourceId)")) return db.invoices.filter(i => i.status === "issued").flatMap(i => {
      const allocations = db.allocations.filter(a => a.invoiceId === i.id);
      return (allocations.length ? allocations.map(a => ({ ...i, ...a, id: i.id })) : [i]).filter(row => p.ids.includes(row.sourceId));
    });
    if (sql.includes("FROM merge_power_servicefeesnapshots") || sql.includes("FROM merge_cloud_rows")) return p.sourceId || p.id ? [db.sources[p.sourceId || p.id]].filter(Boolean) : Object.values(db.sources).filter(row => !p.ids || p.ids.includes(row.snapshotNo));
    if (sql.includes("FROM merge_common_customers WHERE")) return [{ customerId: "buyer", name: "Customer" }];
    if (sql.includes("FROM merge_common_undertaking_units WHERE")) return [{ undertakingUnitId: "seller", name: "Seller" }];
    if (sql.includes("FROM merge_common_invoice_allocations")) return db.allocations.filter(row => row.invoiceId === p.id);
    if (sql.includes("FROM merge_cloud_attachments")) return db.attachments.has(p.id) ? [db.attachments.get(p.id)] : [];
    if (sql.includes("FROM merge_common_invoices")) {
      if (p.unit) return db.invoices.filter(i => i.undertakingUnitId === p.unit && i.invoiceNo === (p.number || p.invoiceNo));
      if (p.sourceType || p.type) return db.invoices.filter(i => i.sourceType === (p.sourceType || p.type) && i.sourceId === (p.sourceId || p.id) && i.status === "issued");
      if (p.id) return db.invoices.filter(i => i.id === p.id);
    }
    return [];
  };
  const execute = async (sql: string, p: Record<string, any>) => {
    if (db.failSql && sql.includes(db.failSql)) throw new Error("test write failed");
    db.writes.push(sql);
    if (sql.includes("INSERT INTO merge_common_invoices")) db.invoices.push({ ...p, status: "issued" });
    if (sql.includes("INSERT INTO merge_common_invoice_allocations")) db.allocations.push({ ...p });
    if (sql.includes("DELETE FROM merge_common_invoice_allocations")) db.allocations = db.allocations.filter(a => a.invoiceId !== p.id);
    if (sql.startsWith("DELETE FROM merge_common_invoices WHERE")) db.invoices = db.invoices.filter(row => row.id !== p.id);
    if (sql.includes("UPDATE merge_common_invoices") && sql.includes("status='void'")) db.invoices.find(i => i.id === p.id)!.status = "void";
    if (sql.includes("UPDATE merge_common_invoices SET allocationPlanJson=:plan")) db.invoices.find(i => i.id === p.id)!.allocationPlanJson = p.plan;
    if (sql.includes("UPDATE merge_power_servicefeesnapshots")) Object.assign(db.sources[p.sourceId], { invoiceNo: p.invoiceNo, invoiceAmountExcludingTax: p.net, invoiceAmountIncludingTax: p.total, invoiceStatus: p.invoiceStatus });
    if (sql.includes("UPDATE merge_cloud_rows")) Object.assign(db.sources[p.sourceId], { invoiceNo: p.invoiceNo, invoiceNetAmount: p.net, invoiceTotalAmount: p.total, collectionInvoice: p.collectionInvoice, invoiceExchangeRate: p.exchangeRate });
    if (sql.includes("INSERT INTO merge_cloud_attachments")) db.attachments.set(p.id, { ...p });
    if (sql.includes("DELETE FROM merge_cloud_attachments")) db.attachments.delete(p.attachmentId);
  };
  return { queryRowsRaw: query, executeRaw: execute,
    queryRowsInTransaction: (_: unknown, sql: string, p: Record<string, any>) => query(sql, p),
    executeInTransaction: (_: unknown, sql: string, p: Record<string, any>) => execute(sql, p),
    withTransaction: async (callback: (c: object) => Promise<unknown>) => {
      const before = structuredClone({ invoices: db.invoices, allocations: db.allocations, sources: db.sources, attachments: db.attachments });
      try { const result = await callback({}); db.committed = true; return result; }
      catch (error) { Object.assign(db, before); throw error; }
    },
  };
});

describe("cloud multi-invoice exchange rates", () => {
  it("preserves the sum of per-invoice USD conversions and recalculates after void", async () => {
    await saveInvoice({ ...baseInput, sourceType: "cloud_row", currency: "CNY", exchangeRate: "7", amountExcludingTax: "700", amountIncludingTax: "700" });
    await saveInvoice({ ...baseInput, sourceType: "cloud_row", invoiceNo: "INV-B", currency: "CNY", exchangeRate: "8", amountExcludingTax: "800", amountIncludingTax: "800" });
    expect(db.sources.sf1.invoiceTotalAmount).toBe("1500.00");
    expect(Number(db.sources.sf1.invoiceExchangeRate)).toBe(7.5);
    await voidInvoice(db.invoices[0].id, "test");
    expect(Number(db.sources.sf1.invoiceExchangeRate)).toBe(8);
  });
  it("does not guess an exchange rate when any invoice rate is missing", () => {
    expect(aggregateInvoiceExchangeRate([{ currency: "CNY", amountIncludingTax: "700", exchangeRate: "7" }, { currency: "CNY", amountIncludingTax: "800", exchangeRate: null }])).toBeNull();
  });
  it("reads the exchange rate from each month's allocation instead of the whole invoice", async () => {
    await saveInvoice({ ...baseInput, sourceType: "cloud_row", currency: "CNY", exchangeRate: "7" });
    const invoice = db.invoices[0];
    invoice.allocationPlanJson = JSON.stringify({ version: 1, allocations: [{ sourceId: "sf1", sourceCurrency: "USD", exchangeRate: "8" }] });
    const entries = await statementInvoiceEntries("cloud_row", ["sf1"]);
    expect(entries[0].exchangeRate).toBe("8");
  });
});
vi.mock("./file-storage-service", () => ({ storeFile: vi.fn(async () => ({ provider: "db", fileName: "invoice.pdf", storageKey: null })), deleteFileObject: vi.fn(), readFile: vi.fn() }));
vi.mock("./invoice-pdf", () => ({ renderInvoicePdf: vi.fn() }));
import { saveInvoice, voidInvoice } from "./invoice-service";
import { readInvoiceAllocationEdit, replaceInvoiceAllocations } from "./invoice-allocation-edit-service";
import { summarizeStatementInvoices as summarizeServiceFeeInvoices, statementInvoiceAttachmentId, statementInvoiceEntries, aggregateInvoiceExchangeRate } from "./statement-invoice-ledger";
import { prepareInvoiceAllocationPlan } from "./invoice-allocation-service";
import { suggestInvoiceAllocations } from "./invoice-allocation";
import { previewStatementInvoiceRemoval, removeStatementInvoiceRegistration } from "./statement-invoice-removal";

const baseInput = { source: "external" as const, sourceId: "sf1", invoiceNo: "INV-A", customerId: "buyer", undertakingUnitId: "seller", currency: "USD", amountExcludingTax: "100.10", taxRate: "0", taxAmount: "0", amountIncludingTax: "100.10", invoiceDate: "2026-10-01", dueDate: "2026-10-31", paymentTermDays: "30", file: { fileName: "invoice.pdf", fileType: "application/pdf", bytes: Buffer.from("invoice A") } };
beforeEach(() => {
  db.invoices = []; db.allocations = []; db.attachments = new Map(); db.writes = []; db.committed = false; db.failSql = "";
  db.sources = Object.fromEntries(["sf1", "sf2"].map((id, index) => [id, { id, snapshotNo: id, period: `20260${index + 1}`, customerReceivableNetAmount: "1000", customerReceivableTotalAmount: "1000", confirmed: 1, businessCustomerId: "buyer", countryCode: "BR", writeOffMonth: `2026-0${index + 1}-01`, serviceFeeTotal: "1000", serviceFeeTotalExcludingTax: "1000", serviceFeeCurrency: "USD", status: "已确认" }]));
});

describe.each(["service_fee", "cloud_row"] as const)("multiple invoices per %s month", sourceType => {
  const input = { ...baseInput, sourceType };
  const netKey = sourceType === "cloud_row" ? "invoiceNetAmount" : "invoiceAmountExcludingTax";
  const totalKey = sourceType === "cloud_row" ? "invoiceTotalAmount" : "invoiceAmountIncludingTax";
  const statusKey = sourceType === "cloud_row" ? "collectionInvoice" : "invoiceStatus";
  const issued = sourceType === "cloud_row" ? "issued" : "已开票";
  const notIssued = sourceType === "cloud_row" ? "not_issued" : "未开票";
  it("deletes a wrong upload, preserves an identical-name original and permits re-registering the same number", async () => {
    await saveInvoice(input); await saveInvoice({ ...input, invoiceNo: "INV-B" });
    const [a, b] = db.invoices;
    const preview = await previewStatementInvoiceRemoval(a.id, { sourceType, sourceId: "sf1" });
    expect(preview).toMatchObject({ mode: "delete", invoiceNo: "INV-A", sources: [{ sourceId: "sf1", amountIncludingTax: "100.10" }] });
    await removeStatementInvoiceRegistration(a.id, { sourceType, sourceId: "sf1", revision: preview.revision }, {}, () => {});
    expect(db.invoices).toHaveLength(1);
    expect(db.sources.sf1).toMatchObject({ invoiceNo: "INV-B", [totalKey]: "100.10", [statusKey]: issued });
    expect(db.attachments.has(statementInvoiceAttachmentId(sourceType, b.id, "sf1"))).toBe(true);
    expect(db.attachments.size).toBe(1);
    expect(db.writes.some(sql => sql.includes("INSERT INTO merge_common_operation_logs"))).toBe(true);
    await saveInvoice(input);
    expect(db.sources.sf1[totalKey]).toBe("200.20");
  });
  it("previews and removes all allocated months, retaining a different invoice on the other month", async () => {
    await saveInvoice(input);
    const a = db.invoices[0];
    db.allocations = [
      { invoiceId: a.id, sourceType, sourceId: "sf1", period: "202601", currency: "USD", amountExcludingTax: "40.10", taxAmount: "0", amountIncludingTax: "40.10" },
      { invoiceId: a.id, sourceType, sourceId: "sf2", period: "202602", currency: "USD", amountExcludingTax: "60.00", taxAmount: "0", amountIncludingTax: "60.00" },
    ];
    db.sources.sf2[netKey] = "60.00"; db.sources.sf2[totalKey] = "60.00";
    await saveInvoice({ ...input, sourceId: "sf2", invoiceNo: "INV-B" });
    const preview = await previewStatementInvoiceRemoval(a.id, { sourceType, sourceId: "sf2" });
    expect(preview.sources.map(row => row.amountIncludingTax)).toEqual(["40.10", "60.00"]);
    await removeStatementInvoiceRegistration(a.id, { sourceType, sourceId: "sf2", revision: preview.revision }, {}, () => {});
    expect(db.allocations).toHaveLength(0);
    expect(db.sources.sf1).toMatchObject({ invoiceNo: null, [totalKey]: null, [statusKey]: notIssued });
    expect(db.sources.sf2).toMatchObject({ invoiceNo: "INV-B", [totalKey]: "100.10", [statusKey]: issued });
  });
  it("rejects stale confirmations, unrelated sources and missing permission without modifying invoices", async () => {
    await saveInvoice(input);
    const a = db.invoices[0];
    const context = { sourceType, sourceId: "sf1" };
    await expect(previewStatementInvoiceRemoval(a.id, { ...context, sourceId: "sf2" })).rejects.toThrow("未关联");
    const preview = await previewStatementInvoiceRemoval(a.id, context);
    await expect(removeStatementInvoiceRegistration(a.id, { ...context, revision: preview.revision }, {}, () => { throw new Error("无权限"); })).rejects.toThrow("无权限");
    db.invoices[0].amountIncludingTax = "999";
    await expect(removeStatementInvoiceRegistration(a.id, { ...context, revision: preview.revision }, {}, () => {})).rejects.toThrow("已变化");
    expect(db.invoices).toHaveLength(1); expect(db.attachments.size).toBe(1);
  });
  it.each(["approval", "generated"])("voids and retains %s records rather than deleting their identity", async kind => {
    await saveInvoice(input);
    const a = db.invoices[0];
    if (kind === "approval") a.approvalInstanceCode = "approval-1";
    else a.source = "generated";
    const context = { sourceType, sourceId: "sf1" };
    const preview = await previewStatementInvoiceRemoval(a.id, context);
    expect(preview.mode).toBe("void");
    await removeStatementInvoiceRegistration(a.id, { ...context, revision: preview.revision }, {}, mode => { expect(mode).toBe("void"); });
    expect(db.invoices[0]).toMatchObject({ id: a.id, status: "void" });
    expect(db.invoices[0].fileContent).toBeTruthy();
    expect(db.sources.sf1[statusKey]).toBe(notIssued);
    await expect(previewStatementInvoiceRemoval(a.id, context)).rejects.toThrow("已移除");
  });
  it("rolls back deletion, attachments and totals when the audit write fails", async () => {
    await saveInvoice(input);
    const a = db.invoices[0]; const context = { sourceType, sourceId: "sf1" };
    const preview = await previewStatementInvoiceRemoval(a.id, context);
    db.failSql = "INSERT INTO merge_common_operation_logs";
    await expect(removeStatementInvoiceRegistration(a.id, { ...context, revision: preview.revision }, {}, () => {})).rejects.toThrow("test write failed");
    expect(db.invoices).toHaveLength(1); expect(db.attachments.size).toBe(1);
    expect(db.sources.sf1).toMatchObject({ invoiceNo: "INV-A", [totalKey]: "100.10", [statusKey]: issued });
  });
  it("appends scanned amounts and keeps both originals even with identical filenames", async () => {
    await saveInvoice(input);
    await saveInvoice({ ...input, invoiceNo: "INV-B", amountExcludingTax: "200.20", amountIncludingTax: "212.21", taxRate: "6", taxAmount: "12.01", file: { ...input.file, bytes: Buffer.from("invoice B") } });
    expect(db.invoices).toHaveLength(2);
    expect(db.sources.sf1).toMatchObject({ invoiceNo: "共 2 张发票", [netKey]: "300.30", [totalKey]: "312.31", status: "已确认" });
    expect(db.attachments.size).toBe(2);
    expect(new Set([...db.attachments.values()].map(row => row.dataUrl)).size).toBe(2);
    expect(db.writes.filter(sql => sql.includes(sourceType === "cloud_row" ? "UPDATE merge_cloud_rows" : "UPDATE merge_power_servicefeesnapshots")).join("\n")).not.toMatch(/(?:SET|,)\s*(?:serviceFeeTotal\w*|repayment\w*|status)\s*=/);
  });
  it("rejects a duplicate issuer and invoice number without counting twice", async () => {
    await saveInvoice(input);
    await expect(saveInvoice(input)).rejects.toThrow("已登记");
    expect(db.invoices).toHaveLength(1);
    expect(db.sources.sf1[totalKey]).toBe("100.10");
  });
  it("rejects mixed currencies atomically", async () => {
    await saveInvoice(input);
    await expect(saveInvoice({ ...input, invoiceNo: "INV-B", currency: "CNY" })).rejects.toThrow("币种");
    expect(db.invoices).toHaveLength(1); expect(db.attachments.size).toBe(1);
    expect(db.sources.sf1[totalKey]).toBe("100.10");
  });
  it("protects existing manually registered amounts until the original invoice is registered", async () => {
    db.sources.sf1.invoiceNo = "MANUAL-OLD";
    await expect(saveInvoice(input)).rejects.toThrow("先上传并登记该原票");
    expect(db.invoices).toHaveLength(0);
    await saveInvoice({ ...input, invoiceNo: "MANUAL-OLD" });
    await saveInvoice(input);
    expect(db.sources.sf1[totalKey]).toBe("200.20");
  });
  it("detects manual changes to an existing invoice summary before appending", async () => {
    await saveInvoice(input);
    db.sources.sf1[totalKey] = "999";
    await expect(saveInvoice({ ...input, invoiceNo: "INV-B" })).rejects.toThrow("手工调整");
    expect(db.sources.sf1[totalKey]).toBe("999");
  });
  it("voids one invoice without clearing the other, then clears after the last invoice", async () => {
    await saveInvoice(input); await saveInvoice({ ...input, invoiceNo: "INV-B" });
    const [a, b] = db.invoices;
    await voidInvoice(a.id, "test");
    expect(db.sources.sf1).toMatchObject({ invoiceNo: "INV-B", [totalKey]: "100.10", [statusKey]: issued });
    expect(db.attachments.has(statementInvoiceAttachmentId(sourceType, b.id, "sf1"))).toBe(true);
    expect(db.attachments.size).toBe(1);
    await voidInvoice(b.id, "test");
    expect(db.sources.sf1).toMatchObject({ invoiceNo: null, [totalKey]: null, [statusKey]: notIssued });
    expect(db.invoices).toHaveLength(2); expect(db.invoices.every(row => row.fileContent)).toBe(true);
  });
  it("counts allocated monthly amounts, never the entire invoice or the primary source twice", async () => {
    await saveInvoice(input);
    const original = db.invoices[0];
    db.allocations = [{ invoiceId: original.id, sourceType, sourceId: "sf1", currency: "USD", amountExcludingTax: "40.10", taxRate: "0", taxAmount: "0", amountIncludingTax: "40.10" }, { invoiceId: original.id, sourceType, sourceId: "sf2", currency: "USD", amountExcludingTax: "60.00", taxRate: "0", taxAmount: "0", amountIncludingTax: "60.00" }];
    db.sources.sf1[netKey] = "40.10"; db.sources.sf1[totalKey] = "40.10";
    await saveInvoice({ ...input, invoiceNo: "INV-B" });
    expect(db.sources.sf1[totalKey]).toBe("140.20");
    expect(summarizeServiceFeeInvoices(await statementInvoiceEntries(sourceType, ["sf2"])).total).toBe("60.00");
  });
  it("uses a weighted tax rate and preserves earliest due/latest invoice dates", () => {
    const sum = summarizeServiceFeeInvoices([{ ...input, id: "a", taxRate: "0", invoiceDate: "2026-10-01", dueDate: "2026-10-31" }, { ...input, id: "b", invoiceNo: "B", amountExcludingTax: "100.10", amountIncludingTax: "106.11", taxRate: "6", taxAmount: "6.01", invoiceDate: "2026-10-03", dueDate: "2026-11-02" }]);
    expect(sum).toMatchObject({ net: "200.20", total: "206.21", invoiceDate: "2026-10-03", dueDate: "2026-10-31" });
    expect(Number(sum.taxRate)).toBeCloseTo(6.01 / 200.2, 6);
  });
  it("reallocates one invoice while preserving another invoice in the removed month", async () => {
    await saveInvoice(input);
    const original = db.invoices[0];
    db.allocations = [
      { invoiceId: original.id, sourceType, sourceId: "sf1", currency: "USD", amountExcludingTax: "40.10", taxRate: "0", taxAmount: "0", amountIncludingTax: "40.10" },
      { invoiceId: original.id, sourceType, sourceId: "sf2", currency: "USD", amountExcludingTax: "60.00", taxRate: "0", taxAmount: "0", amountIncludingTax: "60.00" },
    ];
    db.sources.sf1[netKey] = "40.10"; db.sources.sf1[totalKey] = "40.10";
    db.sources.sf2[netKey] = "60.00"; db.sources.sf2[totalKey] = "60.00";
    await saveInvoice({ ...input, invoiceNo: "INV-B", sourceId: "sf2" });
    const edit = await readInvoiceAllocationEdit(original.id);
    const plan = { ...edit.plan!, allocations: edit.plan!.allocations.filter(row => row.sourceId === "sf1").map(row => ({ ...row, amountExcludingTax: "100.10", amountIncludingTax: "100.10" })) };
    await replaceInvoiceAllocations(original.id, plan, edit.revision);
    expect(db.sources.sf1).toMatchObject({ invoiceNo: "INV-A", [totalKey]: "100.10" });
    expect(db.sources.sf2).toMatchObject({ invoiceNo: "INV-B", [totalKey]: "100.10", [statusKey]: issued });
  });
  it("allows another service-fee invoice in allocation candidates", async () => {
    await saveInvoice(input);
    const source = { sourceType, sourceId: "sf1", sourceNo: "sf1", period: "202601", customerId: "buyer", customerName: "Customer", undertakingUnitId: "seller", account: "BR", sourceCurrency: "USD", sourceNet: "1000.00", sourceTotal: "1000.00", sourceTax: "0.00", sourceTaxRate: "0" };
    const plan = suggestInvoiceAllocations([source], "USD");
    await expect(prepareInvoiceAllocationPlan(plan, { amountExcludingTax: "1000", taxAmount: "0", amountIncludingTax: "1000" })).resolves.toMatchObject({ sourceType });
  });
});
