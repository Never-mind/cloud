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
  /** 系统预留票号（INV-账期-流水）；实际票号在审批通过后按回传发票回填 */
  suggestedInvoiceNo: string;
  invoiceDate: string;
  lines: Array<{ date: string; desc: string; cost: string }>;
  currency: string;
  amountIncludingTax: string;
  amountExcludingTax: string;
  taxRate: string;
  /** 飞书金额控件允许的币种（墨西哥 MXN/USD、智利 CLP） */
  amountCurrencyOptions: string[];
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

/** 按「开票日 + 账期天数」重算约定收款日（用 UTC 运算避开本地时区导致的差一天）。 */
function addDaysToDate(value: string, days: number) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match || !Number.isFinite(days)) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

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
    paymentTermDays: "",
    customerName: "",
    amountCurrency: "",
    amountExcludingTax: "",
    taxRate: "",
    taxAmount: "",
    amountIncludingTax: "",
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
        paymentTermDays: String(data.paymentTermDays ?? ""),
        customerName: data.customer?.name ?? "",
        amountCurrency: data.amountCurrencyOptions.includes(String(data.currency ?? "").toUpperCase())
          ? String(data.currency).toUpperCase()
          : data.amountCurrencyOptions[data.amountCurrencyOptions.length - 1] ?? "",
        amountExcludingTax: data.amountExcludingTax ?? "",
        taxRate: data.taxRate ?? "",
        taxAmount: (Number(data.amountIncludingTax || 0) - Number(data.amountExcludingTax || 0)).toFixed(2),
        amountIncludingTax: data.amountIncludingTax ?? "",
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

  /** 金额联动：改「未税金额 / 税率」重算税金与含税；改「税金」重算含税；「含税金额」可直接改。 */
  function updateAmounts(patch: Partial<Record<"amountExcludingTax" | "taxRate" | "taxAmount" | "amountIncludingTax", string>>) {
    setForm((current) => {
      const next = { ...current, ...patch };
      const net = Number(next.amountExcludingTax);
      const rate = Number(next.taxRate);
      if (patch.amountExcludingTax !== undefined || patch.taxRate !== undefined) {
        if (Number.isFinite(net) && Number.isFinite(rate)) {
          const tax = (net * rate) / 100;
          next.taxAmount = tax.toFixed(2);
          next.amountIncludingTax = (net + tax).toFixed(2);
        }
      } else if (patch.taxAmount !== undefined && Number.isFinite(net) && Number.isFinite(Number(next.taxAmount))) {
        next.amountIncludingTax = (net + Number(next.taxAmount)).toFixed(2);
      }
      return next;
    });
  }

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
          customerOverride: { name: form.customerName, taxId: form.taxId, taxRegime: form.taxRegime, address: form.address, postCode: form.postCode },
          amountIncludingTax: Number(form.amountIncludingTax) || undefined,
          amountCurrency: form.amountCurrency || undefined,
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

  const linesIndex = prefill.branch === "cl" ? 3 : 5;
  /** 单据原币是否在飞书金额控件支持的币种里（不在就提醒，别把金额当成另一种币种提交） */
  const amountCurrencySupported = !prefill.currency
    || prefill.amountCurrencyOptions.includes(String(prefill.currency).toUpperCase());

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
      {!amountCurrencySupported ? (
        <Notice tone="warning">
          本单原币是 {prefill.currency}，不在飞书审批表单支持的币种（{prefill.amountCurrencyOptions.join(" / ") || "—"}）里：
          用飞书审批会把金额当成所选币种提交。建议改用「本地开票」，或者让管理员先把 {prefill.currency} 加进飞书金额控件的币种范围。
        </Notice>
      ) : null}
      {sourceType === "billing_statement" ? (
        <Notice tone="info">
          月账单对账单按国家出具（可能覆盖多个客户），客户抬头默认取该国家的默认客户，请确认它就是本次开票的实际客户。
        </Notice>
      ) : null}

      <div className="grid gap-3 rounded border border-line-soft bg-surface-2 p-4 sm:grid-cols-3">
        <SummaryItem label="客户抬头" value={prefill.customer?.name ?? "—"} />
        <SummaryItem label="开票主体（承接单位）" value={`${prefill.companyText || "—"}${prefill.branch ? `（${BRANCH_LABEL[prefill.branch] ?? prefill.branch}）` : ""}`} />
        <SummaryItem label="账期" value={prefill.period || "—"} />
        <SummaryItem label="来源账单" value={prefill.sourceNo} />
        <SummaryItem label="币种" value={form.amountCurrency || prefill.currency} />
        <SummaryItem label="开票金额（含税）" value={`${form.amountCurrency || prefill.currency} ${form.amountIncludingTax || prefill.amountIncludingTax}`} />
      </div>

      <Section index={1} title="公共字段" subtitle="Purpose / Payment Received Time">
        <div className="space-y-4">
          {/* 用途说明是多行文本，独立一行铺满，避免把同一行的输入框撑高 */}
          <Field label="用途说明 Purpose" required hint="默认按「账期 · 客户」生成，可改成项目/费用描述">
            <Textarea rows={3} value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="约定收款日 Payment Received Time" required hint={`默认 = 开票日 + 账期天数（${prefill.paymentTermDays} 天），改成未来某天即可`}>
              <Input type="date" value={form.paymentReceivedTime} onChange={(event) => setForm({ ...form, paymentReceivedTime: event.target.value })} />
            </Field>
            <Field label="账期天数" hint={`到期日 = 开票日 ${prefill.invoiceDate || "—"} + 天数`}>
              <Input
                inputMode="numeric"
                value={form.paymentTermDays}
                onChange={(event) => {
                  const days = event.target.value;
                  const next = { ...form, paymentTermDays: days };
                  const computed = addDaysToDate(prefill.invoiceDate, Number(days));
                  if (computed) next.paymentReceivedTime = computed;
                  setForm(next);
                }}
              />
            </Field>
          </div>
        </div>
      </Section>

      {prefill.branch === "mx" ? (
        <>
          <Section index={2} title="客户信息" subtitle="Customer Information">
            {/* 4 列栅格，每行正好铺满：长字段占 2 列，付款方式也给 2 列，避免它挤在窄格里显得突兀 */}
            <div className="grid gap-4 md:grid-cols-4">
              <div className="md:col-span-2">
                <Field label="Customer Name">
                  <Input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} />
                </Field>
              </div>
              <Field label="TAX ID" required>
                <Input value={form.taxId} onChange={(event) => setForm({ ...form, taxId: event.target.value })} />
              </Field>
              <Field label="Post code 邮编" required>
                <Input placeholder="06500" value={form.postCode} onChange={(event) => setForm({ ...form, postCode: event.target.value })} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Tax Regime 税制" required>
                  <Input placeholder="Régimen General de Ley Personas Morales" value={form.taxRegime} onChange={(event) => setForm({ ...form, taxRegime: event.target.value })} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Payment Method 付款方式" required>
                  <Select value={form.paymentMethodKey} onChange={(event) => setForm({ ...form, paymentMethodKey: event.target.value })}>
                    {prefill.options.paymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="md:col-span-4">
                <Field label="Address 注册地址" required>
                  <Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
                </Field>
              </div>
            </div>
          </Section>

          <Section index={3} title="发票信息" subtitle="Invoice Information">
            <div className="grid gap-4 md:grid-cols-3">
              {/* 金额与币种默认带账单口径，允许人工改：飞书金额控件支持 MXN / USD（智利固定 CLP） */}
              <Field label="币种 Currency" hint={`本次按 ${form.amountCurrency} 开票`}>
                <Select value={form.amountCurrency} onChange={(event) => setForm({ ...form, amountCurrency: event.target.value })}>
                  {prefill.amountCurrencyOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </Field>
              <Field label="未税金额">
                <Input inputMode="decimal" value={form.amountExcludingTax} onChange={(event) => updateAmounts({ amountExcludingTax: event.target.value })} />
              </Field>
              <Field label="税率（%）" hint="填百分数：16% 就填 16">
                <Input inputMode="decimal" value={form.taxRate} onChange={(event) => updateAmounts({ taxRate: event.target.value })} />
              </Field>
              <Field label="税金">
                <Input inputMode="decimal" value={form.taxAmount} onChange={(event) => updateAmounts({ taxAmount: event.target.value })} />
              </Field>
              <Field label="含税金额 Amount" required hint="飞书审批里的开票金额就是这一项">
                <Input inputMode="decimal" value={form.amountIncludingTax} onChange={(event) => setForm({ ...form, amountIncludingTax: event.target.value })} />
              </Field>
              <Field label="CFDI Code 用途码" required>
                <Select value={form.cfdiCodeKey} onChange={(event) => setForm({ ...form, cfdiCodeKey: event.target.value })}>
                  {prefill.options.cfdiCodes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </Select>
              </Field>
              <div className="md:col-span-3">
                <Field label="Invoice Content 开票内容" required>
                  <Input value={form.invoiceContent} onChange={(event) => setForm({ ...form, invoiceContent: event.target.value })} />
                </Field>
              </div>
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


      <Section index={linesIndex} title="账期明细" subtitle="Invoice Lines" hint="明细来自来源账单，审批通过后与发票信息一并回填到该账单行。">
        {prefill.lines.length ? (
          <div className="overflow-hidden rounded border border-line-soft">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-canvas">
                <tr>
                  {["期间", "描述", "金额"].map((label) => (
                    <th className="border-b border-line-soft px-3 py-2 text-left font-medium text-ink-2" key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prefill.lines.map((line, index) => (
                  <tr key={`${line.date}-${index}`}>
                    <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">{line.date || "—"}</td>
                    <td className="border-b border-line-soft px-3 py-2">{line.desc || "—"}</td>
                    <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">{`${prefill.currency} ${line.cost}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded border border-dashed border-line bg-white px-3 py-4 text-sm text-ink-3">这张账单没有明细行，票面按金额开具。</p>
        )}
      </Section>

      <div className="rounded border border-line-soft bg-surface-2 px-3 py-3 text-xs leading-relaxed text-ink-3">
        <div className="mb-2 flex items-center gap-1.5 text-ink-2">
          <span className="rounded bg-white px-2 py-0.5 font-medium">提交</span>
          <span className="text-ink-4">→</span>
          <span className="rounded bg-white px-2 py-0.5 font-medium">审批</span>
          <span className="text-ink-4">→</span>
          <span className="rounded bg-white px-2 py-0.5 font-medium">审批</span>
          <span className="text-ink-4">→</span>
          <span className="rounded bg-white px-2 py-0.5 font-medium text-success">出票</span>
        </div>
        提交后会以<b className="text-ink-2">当前登录人的飞书身份</b>发起审批（审批流程 Cloud invoicing process · {prefill.approvalCode}），两级固定审批人。
        系统预留票号 <b className="text-ink-2">{prefill.suggestedInvoiceNo || "保存时自动分配"}</b>（开票日期 {prefill.invoiceDate || "—"}）；
        审批中不需要再操作，通过后系统按回传的真实发票自动出票并回填票号、开票日期与金额，票面挂到该行的开票附件下。
      </div>
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
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-ink-2">
        {required ? <span className="text-danger">*</span> : null}
        {label}
      </span>
      {/* Input / Select / Textarea 只有 min-w-0 max-w-full，宽度由内容决定：textarea 会缩成默认 20 列、 */}
      {/* select 会被最长选项撑宽。这里统一拉满，保证同一栅格里的控件等宽。 */}
      <div className="min-w-0 [&>input]:w-full [&>select]:w-full [&>textarea]:w-full">{children}</div>
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
