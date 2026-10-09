"use client";

/**
 * 飞书审批开票弹层。
 *
 * 与「本地直接开票」并存：这里只负责发起审批（飞书 Cloud invoicing process），
 * 审批通过后才出票 —— 界面上没有跳过审批的入口。
 * 金额、账期、客户、开票主体都由服务端按来源账单现算，避免与账单不一致。
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Input, Select, Textarea } from "./ui";
import { Modal } from "./modal";
import { notify } from "./app-dialog";

type Option = { key: string; value: string; label: string };

type Prefill = {
  approvalCode: string;
  existingApproval: { instanceCode: string; status: string; serialNumber: string; rejectReason: string; submittedAt: string } | null;
  branch: "mx" | "cl" | "br" | null;
  companyText: string;
  sourceNo: string;
  period: string;
  currency: string;
  amountIncludingTax: string;
  suggestedPurpose: string;
  suggestedInvoiceContent: string;
  paymentReceivedTime: string;
  paymentTermDays: number;
  customer: { customerId: string; name: string; taxId: string; taxRegime: string; address: string; postCode: string } | null;
  customerAttachments: Array<{ attachmentId: string; fileName: string; fileSize: number; uploadedAt: string | null }>;
  options: { paymentMethods: Option[]; cfdiCodes: Option[]; chileInvoiceTypes: Option[]; chileNote2: Option[] };
  blockers: string[];
  warnings: string[];
};

const BRANCH_LABEL: Record<string, string> = { mx: "墨西哥", cl: "智利", br: "巴西" };

export function InvoiceApprovalModal({
  onClose,
  onSubmitted,
  open,
  sourceId,
  sourceIds = [],
  sourceType,
}: {
  onClose: () => void;
  onSubmitted?: (instanceCode: string) => void;
  open: boolean;
  sourceId: string;
  /** 合并多账期时勾选的行 ID（与开票弹层保持一致） */
  sourceIds?: string[];
  sourceType: string;
}) {
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    purpose: "",
    paymentReceivedTime: "",
    taxId: "",
    taxRegime: "",
    address: "",
    postCode: "",
    paymentMethodKey: "",
    cfdiCodeKey: "",
    invoiceContent: "",
    cfsAttachmentId: "",
    chileInvoiceTypeKey: "",
    chileAmount: "",
    chileNote1: "",
    chileNote2Key: "",
    chileNote3: "",
    chileNote4: "",
  });

  const load = useCallback(async () => {
    if (!sourceId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ sourceType, sourceId });
      if (sourceIds.length) params.set("sourceIds", sourceIds.join(","));
      const response = await fetch(`/api/invoices/approval/prefill?${params}`, { cache: "no-store" });
      const data = (await response.json()) as Prefill & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "审批预填失败");
      setPrefill(data);
      setForm({
        purpose: data.suggestedPurpose,
        paymentReceivedTime: data.paymentReceivedTime,
        taxId: data.customer?.taxId ?? "",
        taxRegime: data.customer?.taxRegime ?? "",
        address: data.customer?.address ?? "",
        postCode: data.customer?.postCode ?? "",
        paymentMethodKey: data.options.paymentMethods.find((item) => item.key === "PPD")?.value ?? data.options.paymentMethods[0]?.value ?? "",
        cfdiCodeKey: data.options.cfdiCodes.find((item) => item.key === "G03")?.value ?? data.options.cfdiCodes[0]?.value ?? "",
        invoiceContent: data.suggestedInvoiceContent,
        cfsAttachmentId: "",
        chileInvoiceTypeKey: data.options.chileInvoiceTypes[0]?.value ?? "",
        chileAmount: "",
        chileNote1: "",
        chileNote2Key: data.options.chileNote2[0]?.value ?? "",
        chileNote3: "",
        chileNote4: "",
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "审批预填失败", "info");
      setPrefill(null);
    } finally {
      setLoading(false);
    }
  }, [sourceId, sourceIds, sourceType]);

  useEffect(() => {
    if (!open) return;
    setPrefill(null);
    void load();
  }, [open, load]);

  async function submit() {
    if (!prefill) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/invoices/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType,
          sourceId,
          sourceIds: sourceIds.length ? sourceIds : undefined,
          purpose: form.purpose,
          paymentReceivedTime: form.paymentReceivedTime,
          invoiceContent: form.invoiceContent,
          paymentMethodKey: form.paymentMethodKey,
          cfdiCodeKey: form.cfdiCodeKey,
          customerOverride: { taxId: form.taxId, taxRegime: form.taxRegime, address: form.address, postCode: form.postCode },
          cfsAttachmentId: form.cfsAttachmentId || undefined,
          chile: prefill.branch === "cl"
            ? {
              invoiceTypeKey: form.chileInvoiceTypeKey,
              amountIncludingTax: Number(form.chileAmount),
              note1: form.chileNote1,
              note2Key: form.chileNote2Key,
              note3: Number(form.chileNote3),
              note4: Number(form.chileNote4),
            }
            : undefined,
        }),
      });
      const data = (await response.json()) as { instanceCode?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "发起审批失败");
      notify(`已提交飞书审批：${data.instanceCode ?? ""}`, "success");
      onSubmitted?.(String(data.instanceCode ?? ""));
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "发起审批失败", "info");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const blocked = !prefill || prefill.blockers.length > 0 || prefill.branch === "br" || prefill.branch === null || Boolean(prefill.existingApproval);
  const footer = (
    <>
      <Button onClick={onClose}>取消</Button>
      <Button disabled={blocked || submitting || loading} onClick={() => void submit()} tone="primary">
        {submitting ? "提交中…" : "提交飞书审批"}
      </Button>
    </>
  );

  return (
    <Modal
      description={prefill ? `审批流程：Cloud invoicing process · ${prefill.approvalCode}` : "正在读取账单与档案…"}
      footer={footer}
      onClose={onClose}
      title="提交飞书审批开票"
      widthClass="max-w-4xl"
    >
      {loading || !prefill ? (
        <div className="py-10 text-center text-sm text-ink-3">正在按账单预填…</div>
      ) : (
        <div className="space-y-5">
          {prefill.existingApproval ? (
            <div className="rounded border border-info-border bg-info-soft px-4 py-3 text-sm text-info-ink">
              该账单已有一条审批：{prefill.existingApproval.status === "pending" ? "审批中" : prefill.existingApproval.status === "approved" ? "已通过（待出票）" : prefill.existingApproval.status}
              ，单号 {prefill.existingApproval.serialNumber || prefill.existingApproval.instanceCode}，提交于 {prefill.existingApproval.submittedAt}。
              不需要重复发起 —— 审批通过后系统会自动出票；如果被驳回，可以在这里重新提交。
            </div>
          ) : null}
          {prefill.blockers.map((item) => (
            <div className="rounded border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger" key={item}>✕ {item}</div>
          ))}
          {prefill.warnings.map((item) => (
            <div className="rounded border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning" key={item}>！ {item}</div>
          ))}

          <section className="grid gap-4 md:grid-cols-3">
            <div>
              <span className="mb-1 block text-xs text-ink-3">开票主体（承接单位）</span>
              <Input readOnly value={`${prefill.companyText || "—"}${prefill.branch ? `（${BRANCH_LABEL[prefill.branch] ?? prefill.branch}）` : ""}`} />
            </div>
            <div>
              <span className="mb-1 block text-xs text-ink-3">来源账单</span>
              <Input readOnly value={prefill.sourceNo} />
            </div>
            <div>
              <span className="mb-1 block text-xs text-ink-3">开票金额（含税）</span>
              <Input readOnly value={`${prefill.currency} ${prefill.amountIncludingTax}`} />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-ink">公共字段</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <span className="mb-1 block text-xs text-ink-3">用途说明 Purpose *</span>
                <Textarea value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} />
                <p className="mt-1 text-xs text-ink-3">默认按「账期 · 客户」生成，可改成项目/费用描述</p>
              </div>
              <div>
                <span className="mb-1 block text-xs text-ink-3">约定收款日 Payment Received Time *</span>
                <Input type="date" value={form.paymentReceivedTime} onChange={(event) => setForm({ ...form, paymentReceivedTime: event.target.value })} />
                <p className="mt-1 text-xs text-ink-3">默认 = 开票日 + 账期天数（{prefill.paymentTermDays} 天），改成未来某天即可</p>
              </div>
            </div>
          </section>

          {prefill.branch === "mx" ? (
            <>
              <section className="space-y-3 rounded border border-line-soft bg-surface-2 p-4">
                <h3 className="text-sm font-medium text-ink">Customer Information</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <span className="mb-1 block text-xs text-ink-3">Customer Name</span>
                    <Input readOnly value={prefill.customer?.name ?? ""} />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-ink-3">TAX ID *</span>
                    <Input value={form.taxId} onChange={(event) => setForm({ ...form, taxId: event.target.value })} />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-ink-3">Tax Regimn（税制）*</span>
                    <Input placeholder="Régimen General de Ley Personas Morales" value={form.taxRegime} onChange={(event) => setForm({ ...form, taxRegime: event.target.value })} />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-ink-3">Payment Method *</span>
                    <Select value={form.paymentMethodKey} onChange={(event) => setForm({ ...form, paymentMethodKey: event.target.value })}>
                      {prefill.options.paymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <span className="mb-1 block text-xs text-ink-3">Address *</span>
                    <Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-ink-3">Post code *</span>
                    <Input placeholder="06500" value={form.postCode} onChange={(event) => setForm({ ...form, postCode: event.target.value })} />
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded border border-line-soft bg-surface-2 p-4">
                <h3 className="text-sm font-medium text-ink">Invoice Information</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <span className="mb-1 block text-xs text-ink-3">Amount (incl. 16% tax)</span>
                    <Input readOnly value={`${prefill.amountIncludingTax} ${prefill.currency}`} />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-ink-3">Invoice Content *</span>
                    <Input value={form.invoiceContent} onChange={(event) => setForm({ ...form, invoiceContent: event.target.value })} />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-ink-3">CFDI Code *</span>
                    <Select value={form.cfdiCodeKey} onChange={(event) => setForm({ ...form, cfdiCodeKey: event.target.value })}>
                      {prefill.options.cfdiCodes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </Select>
                  </div>
                </div>
              </section>

              <section className="space-y-2 rounded border border-line-soft bg-surface-2 p-4">
                <h3 className="text-sm font-medium text-ink">Attachment (Customer CFS) *</h3>
                {prefill.customerAttachments.length ? (
                  <div className="divide-y divide-line-soft rounded border border-line bg-white">
                    {prefill.customerAttachments.map((attachment) => (
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm" key={attachment.attachmentId}>
                        <input
                          checked={form.cfsAttachmentId === attachment.attachmentId}
                          name="cfs"
                          onChange={() => setForm({ ...form, cfsAttachmentId: attachment.attachmentId })}
                          type="radio"
                        />
                        <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
                        <span className="text-xs text-ink-3">{Math.max(1, Math.round(Number(attachment.fileSize ?? 0) / 1024))} KB</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-3">客户档案里没有附件。请先在客户档案上传 CSF，再回来提交。</p>
                )}
                <p className="text-xs text-ink-3">从客户档案已有附件里选一个作为 CSF（档案里常掺杂其它文件，所以由人工确认）。</p>
              </section>
            </>
          ) : null}

          {prefill.branch === "cl" ? (
            <section className="space-y-3 rounded border border-line-soft bg-surface-2 p-4">
              <h3 className="text-sm font-medium text-ink">智利分支（人工填写）</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <span className="mb-1 block text-xs text-ink-3">Invoice Type *</span>
                  <Select value={form.chileInvoiceTypeKey} onChange={(event) => setForm({ ...form, chileInvoiceTypeKey: event.target.value })}>
                    {prefill.options.chileInvoiceTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </Select>
                </div>
                <div>
                  <span className="mb-1 block text-xs text-ink-3">Amount (incl. 19% tax) CLP *</span>
                  <Input inputMode="decimal" value={form.chileAmount} onChange={(event) => setForm({ ...form, chileAmount: event.target.value })} />
                </div>
                <div>
                  <span className="mb-1 block text-xs text-ink-3">Notes on the invoice 1 *</span>
                  <Input value={form.chileNote1} onChange={(event) => setForm({ ...form, chileNote1: event.target.value })} />
                </div>
                <div>
                  <span className="mb-1 block text-xs text-ink-3">Notes on the invoice 2 *</span>
                  <Select value={form.chileNote2Key} onChange={(event) => setForm({ ...form, chileNote2Key: event.target.value })}>
                    {prefill.options.chileNote2.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </Select>
                </div>
                <div>
                  <span className="mb-1 block text-xs text-ink-3">Notes on the invoice 3 *</span>
                  <Input inputMode="decimal" value={form.chileNote3} onChange={(event) => setForm({ ...form, chileNote3: event.target.value })} />
                </div>
                <div>
                  <span className="mb-1 block text-xs text-ink-3">Notes on the invoice 4 *</span>
                  <Input inputMode="decimal" value={form.chileNote4} onChange={(event) => setForm({ ...form, chileNote4: event.target.value })} />
                </div>
              </div>
            </section>
          ) : null}

          <p className="text-xs text-ink-3">
            提交后会以<b>当前登录人的飞书身份</b>发起审批，审批中不需要再操作；通过后系统自动出票并回填票号、把票面挂到该行的开票附件下。
          </p>
        </div>
      )}
    </Modal>
  );
}
