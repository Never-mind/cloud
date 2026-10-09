"use client";

/**
 * 飞书审批开票的表单内容（不带弹窗外壳）。
 *
 * 与「本地开票」并存在同一个开票弹层里，由顶部的分段切换选择，所以这里只渲染内容：
 * 弹层标题、底部按钮由 `InvoiceDraftModal` 统一提供，避免出现两层弹窗、也避免用户
 * 必须滚到最底才能看到「提交」。
 *
 * 金额、账期、客户、开票主体都由服务端按来源账单现算，避免与账单不一致。
 */
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Info } from "lucide-react";
import { Input, Select, Textarea } from "./ui";
import { notify } from "./app-dialog";

type Option = { key: string; value: string; label: string };

export type ApprovalPrefill = {
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

/** 上报给外层的状态：外层拿它渲染底部按钮。 */
export type ApprovalPanelState = {
  loading: boolean;
  blocked: boolean;
  submitting: boolean;
  submit: () => Promise<void>;
};

const BRANCH_LABEL: Record<string, string> = { mx: "墨西哥", cl: "智利", br: "巴西" };

export function InvoiceApprovalPanel({
  onClose,
  onStateChange,
  onSubmitted,
  sourceId,
  sourceIds = [],
  sourceType,
}: {
  onClose: () => void;
  onStateChange?: (state: ApprovalPanelState) => void;
  onSubmitted?: (instanceCode: string) => void;
  sourceId: string;
  /** 合并多账期时勾选的行 ID */
  sourceIds?: string[];
  sourceType: string;
}) {
  const [prefill, setPrefill] = useState<ApprovalPrefill | null>(null);
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
      const data = (await response.json()) as ApprovalPrefill & { error?: string };
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
    setPrefill(null);
    void load();
  }, [load]);

  const submit = useCallback(async () => {
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
  }, [form, onClose, onSubmitted, prefill, sourceId, sourceIds, sourceType]);

  const blocked = !prefill || prefill.blockers.length > 0 || prefill.branch === "br" || prefill.branch === null || Boolean(prefill.existingApproval);

  useEffect(() => {
    onStateChange?.({ loading, blocked, submitting, submit });
  }, [blocked, loading, onStateChange, submit, submitting]);

  if (loading || !prefill) {
    return (
      <div className="flex items-center justify-center gap-2 rounded border border-line-soft bg-surface-2 py-12 text-sm text-ink-3">
        <FileText size={16} />
        正在按账单与档案生成审批内容…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {prefill.existingApproval ? (
        <Notice tone="info">
          该账单已有一条审批：{prefill.existingApproval.status === "pending" ? "审批中" : prefill.existingApproval.status === "approved" ? "已通过（待出票）" : prefill.existingApproval.status}
          ，单号 {prefill.existingApproval.serialNumber || prefill.existingApproval.instanceCode}，提交于 {prefill.existingApproval.submittedAt}。
          不需要重复发起 —— 审批通过后系统会自动出票；如果被驳回，可以在这里重新提交。
        </Notice>
      ) : null}
      {prefill.blockers.map((item) => <Notice key={item} tone="danger">{item}</Notice>)}
      {prefill.warnings.map((item) => <Notice key={item} tone="warning">{item}</Notice>)}

      <div className="grid gap-3 rounded border border-line-soft bg-surface-2 p-4 sm:grid-cols-3">
        <SummaryItem label="开票主体（承接单位）" value={`${prefill.companyText || "—"}${prefill.branch ? `（${BRANCH_LABEL[prefill.branch] ?? prefill.branch}）` : ""}`} />
        <SummaryItem label="来源账单" value={prefill.sourceNo} />
        <SummaryItem label="开票金额（含税）" value={`${prefill.currency} ${prefill.amountIncludingTax}`} />
      </div>

      <Section index={1} title="公共字段" subtitle="Purpose / Payment Received Time">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="用途说明 Purpose" required hint="默认按「账期 · 客户」生成，可改成项目/费用描述">
            <Textarea rows={3} value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} />
          </Field>
          <Field label="约定收款日 Payment Received Time" required hint={`默认 = 开票日 + 账期天数（${prefill.paymentTermDays} 天），改成未来某天即可`}>
            <Input type="date" value={form.paymentReceivedTime} onChange={(event) => setForm({ ...form, paymentReceivedTime: event.target.value })} />
          </Field>
        </div>
      </Section>

      {prefill.branch === "mx" ? (
        <>
          <Section index={2} title="客户信息" subtitle="Customer Information">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Customer Name">
                <Input readOnly value={prefill.customer?.name ?? ""} />
              </Field>
              <Field label="TAX ID" required>
                <Input value={form.taxId} onChange={(event) => setForm({ ...form, taxId: event.target.value })} />
              </Field>
              <Field label="Tax Regime 税制" required>
                <Input placeholder="Régimen General de Ley Personas Morales" value={form.taxRegime} onChange={(event) => setForm({ ...form, taxRegime: event.target.value })} />
              </Field>
              <Field label="Payment Method 付款方式" required>
                <Select value={form.paymentMethodKey} onChange={(event) => setForm({ ...form, paymentMethodKey: event.target.value })}>
                  {prefill.options.paymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </Select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Address 注册地址" required>
                  <Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
                </Field>
              </div>
              <Field label="Post code 邮编" required>
                <Input placeholder="06500" value={form.postCode} onChange={(event) => setForm({ ...form, postCode: event.target.value })} />
              </Field>
            </div>
          </Section>

          <Section index={3} title="发票信息" subtitle="Invoice Information">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Amount (incl. 16% tax)">
                <Input readOnly value={`${prefill.amountIncludingTax} ${prefill.currency}`} />
              </Field>
              <Field label="Invoice Content 开票内容" required>
                <Input value={form.invoiceContent} onChange={(event) => setForm({ ...form, invoiceContent: event.target.value })} />
              </Field>
              <Field label="CFDI Code 用途码" required>
                <Select value={form.cfdiCodeKey} onChange={(event) => setForm({ ...form, cfdiCodeKey: event.target.value })}>
                  {prefill.options.cfdiCodes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </Select>
              </Field>
            </div>
          </Section>

          <Section index={4} title="客户 CSF 附件" subtitle="Attachment (Customer CFS)" hint="从客户档案已有附件里选一个；档案里常掺杂其它文件，所以由人工确认。">
            {prefill.customerAttachments.length ? (
              <div className="space-y-1.5">
                {prefill.customerAttachments.map((attachment) => {
                  const active = form.cfsAttachmentId === attachment.attachmentId;
                  return (
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2 text-sm transition-colors ${active ? "border-primary bg-info-soft" : "border-line-soft bg-white hover:border-info-border hover:bg-surface-2"}`}
                      key={attachment.attachmentId}
                    >
                      <input
                        checked={active}
                        className="h-4 w-4"
                        name="cfs"
                        onChange={() => setForm({ ...form, cfsAttachmentId: attachment.attachmentId })}
                        type="radio"
                      />
                      <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
                      <span className="shrink-0 text-xs text-ink-3">{Math.max(1, Math.round(Number(attachment.fileSize ?? 0) / 1024))} KB</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="rounded border border-dashed border-line bg-white px-3 py-4 text-sm text-ink-3">客户档案里没有附件。请先在客户档案上传 CSF，再回来提交。</p>
            )}
          </Section>
        </>
      ) : null}

      {prefill.branch === "cl" ? (
        <Section index={2} title="智利发票信息" subtitle="Invoice Information Chile" hint="智利分支由人工填写，金额币种为 CLP。">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Invoice Type 发票类型" required>
              <Select value={form.chileInvoiceTypeKey} onChange={(event) => setForm({ ...form, chileInvoiceTypeKey: event.target.value })}>
                {prefill.options.chileInvoiceTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
            </Field>
            <Field label="Amount (incl. 19% tax) CLP" required>
              <Input inputMode="decimal" value={form.chileAmount} onChange={(event) => setForm({ ...form, chileAmount: event.target.value })} />
            </Field>
            <Field label="Notes on the invoice 1" required>
              <Input value={form.chileNote1} onChange={(event) => setForm({ ...form, chileNote1: event.target.value })} />
            </Field>
            <Field label="Notes on the invoice 2" required>
              <Select value={form.chileNote2Key} onChange={(event) => setForm({ ...form, chileNote2Key: event.target.value })}>
                {prefill.options.chileNote2.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
            </Field>
            <Field label="Notes on the invoice 3" required>
              <Input inputMode="decimal" value={form.chileNote3} onChange={(event) => setForm({ ...form, chileNote3: event.target.value })} />
            </Field>
            <Field label="Notes on the invoice 4" required>
              <Input inputMode="decimal" value={form.chileNote4} onChange={(event) => setForm({ ...form, chileNote4: event.target.value })} />
            </Field>
          </div>
        </Section>
      ) : null}

      <p className="rounded border border-line-soft bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-3">
        提交后会以<b className="text-ink-2">当前登录人的飞书身份</b>发起审批（审批流程 Cloud invoicing process · {prefill.approvalCode}）。
        审批中不需要再操作；通过后系统自动出票并回填票号、把票面挂到该行的开票附件下。
      </p>
    </div>
  );
}

function Section({
  children,
  hint,
  index,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  hint?: string;
  index: number;
  subtitle?: string;
  title: string;
}) {
  return (
    <section className="rounded border border-line-soft bg-white p-4">
      <div className="mb-3 flex items-center gap-2 border-b border-line-soft pb-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium text-primary">{index}</span>
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        {subtitle ? <span className="text-xs text-ink-4">{subtitle}</span> : null}
      </div>
      {hint ? <p className="mb-3 text-xs text-ink-3">{hint}</p> : null}
      {children}
    </section>
  );
}

function Field({ children, hint, label, required }: { children: React.ReactNode; hint?: string; label: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-2">
        {required ? <span className="text-danger">*</span> : null}
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium text-ink" title={value}>{value || "—"}</div>
    </div>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "danger" | "info" | "warning" }) {
  const styles = {
    danger: { box: "border-danger/40 bg-danger-soft text-danger", Icon: AlertCircle },
    info: { box: "border-info-border bg-info-soft text-info-ink", Icon: Info },
    warning: { box: "border-warning/40 bg-warning-soft text-warning-ink", Icon: CheckCircle2 },
  }[tone];
  const Icon = styles.Icon;
  return (
    <div className={`flex items-start gap-2 rounded border px-3 py-2 text-sm leading-relaxed ${styles.box}`}>
      <Icon className="mt-0.5 shrink-0" size={15} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
