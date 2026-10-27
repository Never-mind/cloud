export const INVOICE_ATTACHMENT_LIMITS = { count: 10, fileBytes: 10 * 1024 * 1024, totalBytes: 30 * 1024 * 1024 };

export type InvoiceAttachmentSource = "customer" | "billing_statement" | "cloud_row" | "service_fee" | "settlement_invoice" | "settlement_project";
export type InvoiceAttachmentRef = { source: InvoiceAttachmentSource; attachmentId: string; isCsf?: boolean };
export type InvoiceAttachmentUpload = { fileName: string; dataUrl: string; isCsf?: boolean };
export type InvoiceAttachmentOption = InvoiceAttachmentRef & { fileName: string; fileSize: number; sourceLabel: string; uploadedAt?: string };
export type InvoiceAttachmentSelection = { attachmentRefs?: InvoiceAttachmentRef[]; attachments?: InvoiceAttachmentUpload[] };
export const invoiceAttachmentKey = (file: InvoiceAttachmentRef) => `${file.source}:${file.attachmentId}`;

export function cloudAttachmentField(form: string, companyKey: string): { id: string; name: string } | null {
  const visible = (condition: unknown): boolean => {
    if (condition == null) return true;
    if (typeof condition !== "object") return false;
    const item = condition as { conditional?: string; conditions?: unknown[]; expressions?: Array<{ source_widget?: { id: string }; compare_type?: string; standard_value?: string }> };
    const checks = [...(item.conditions ?? []).map(visible), ...(item.expressions ?? []).map(expr => expr.source_widget?.id === "widget17634571084590001" && expr.compare_type === "is" && expr.standard_value === companyKey)];
    return checks.length > 0 && (item.conditional === "OR" ? checks.some(Boolean) : item.conditional === "AND" ? checks.every(Boolean) : false);
  };
  const widgets = JSON.parse(form) as Array<{ id: string; name: string; type: string; display_condition?: unknown }>;
  const widget = widgets.find(item => item.type === "attachmentV2" && visible(item.display_condition));
  return widget ? { id: widget.id, name: widget.name } : null;
}

export function parseInvoiceAttachmentSelection(input: InvoiceAttachmentSelection) {
  const rawRefs = input.attachmentRefs ?? [], uploads = input.attachments ?? [];
  if (!Array.isArray(rawRefs) || !Array.isArray(uploads)) throw new Error("附件材料格式不正确");
  const sources = ["customer", "billing_statement", "cloud_row", "service_fee", "settlement_invoice", "settlement_project"];
  const refs = new Map<string, InvoiceAttachmentRef>();
  for (const ref of rawRefs) {
    if (!ref || !sources.includes(ref.source) || typeof ref.attachmentId !== "string" || !ref.attachmentId.trim()) throw new Error("附件引用不正确");
    const key = invoiceAttachmentKey(ref);
    refs.set(key, { source: ref.source, attachmentId: ref.attachmentId, isCsf: ref.isCsf === true || refs.get(key)?.isCsf === true });
  }
  if (refs.size + uploads.length > INVOICE_ATTACHMENT_LIMITS.count) throw new Error("审批材料最多 10 个附件");
  for (const file of uploads) {
    if (!file || typeof file.fileName !== "string" || !file.fileName.trim() || file.fileName.length > 255 || /[\\/\x00-\x1f]/.test(file.fileName) || typeof file.dataUrl !== "string") throw new Error("上传附件的文件名或内容不正确");
    if (file.dataUrl.length > Math.ceil(INVOICE_ATTACHMENT_LIMITS.fileBytes / 3) * 4 + 1024) throw new Error("单个审批附件不能超过 10 MB");
  }
  return { attachmentRefs: [...refs.values()], attachments: uploads.map(file => ({ fileName: file.fileName.trim(), dataUrl: file.dataUrl, isCsf: file.isCsf === true })) };
}
