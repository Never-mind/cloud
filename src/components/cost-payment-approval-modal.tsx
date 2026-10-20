"use client";

/**
 * 成本款付款申请弹层（华为云供应商付款 / 集采发票汇总 / 算力采购订单共用）。
 *
 * 版式：顶部「明细数 / 合计 / 成本项目」摘要 → 基本信息 → 每条明细一张卡片（字段竖排）。
 * 可选项（客户名称 / 手续费 / 发票 / 币种 / 成本公司）优先用**飞书审批定义里读回来的选项**，
 * 审批后台加了新选项，这里会自动出现；读不到时回落到内置列表。
 */
import { useEffect, useMemo, useState } from "react";
import { Banknote, Building2, ChevronDown, Paperclip, Upload } from "lucide-react";
import { Button, Input, Select, Textarea } from "./ui";
import { Modal } from "./modal";
import { notify } from "./app-dialog";
import { formatDisplayValue } from "@/lib/display-format";

type Branch = "huawei" | "other" | "compute";
type Option = { value: string; text: string };

type BankAccount = {
  accountId: string;
  accountName: string;
  bankName: string;
  bankAccount: string;
  swiftCode: string;
  currency: string;
  isDefault: boolean;
};

type PreviewRow = {
  ownerId: string;
  ownerNo: string;
  period: string;
  supplierId: string;
  supplierName: string;
  supplierFullName: string;
  undertakingUnitCode: string;
  undertakingUnitName: string;
  amount: number;
  currency: string;
  payee: string;
  bankName: string;
  bankAccount: string;
  swiftCode: string;
  paymentDate: string;
  invoiceIssued: boolean;
  customerName: string;
  sources: Array<{ customer: string; account: string; amount: number }>;
  orderNo: string;
  batchNo: string;
  projectNo: string;
  projectName: string;
  countryCode: string;
  countryName: string;
  quantity: number;
  requestNos: string[];
  paid: boolean;
  bankAccounts: BankAccount[];
};

type DraftRow = PreviewRow & {
  feeOptionKey: string;
  invoiceOptionKey: string;
  customerOptionKey: string;
  accountId: string;
  attachments: Array<{ fileName: string; dataUrl: string }>;
};

type CompanyOption = { code: string; name: string; companyKey: string };
type BranchOptions = { company: Option[]; customer: Option[]; fee: Option[]; invoice: Option[]; currencies: string[] };

const BRANCH_TITLE: Record<Branch, string> = {
  huawei: "华为云业务 · 供应商付款",
  other: "集采系统 · 发票汇总",
  compute: "算力系统 · 采购订单",
};

const PROJECT_LABEL: Record<Branch, string> = { huawei: "华为云", other: "其他", compute: "算力" };

const OWNER_TYPE: Record<Branch, "cloud_supplier_payment" | "settlement_invoice_payment" | "purchase_order_payment"> = {
  huawei: "cloud_supplier_payment",
  other: "settlement_invoice_payment",
  compute: "purchase_order_payment",
};

export function CostPaymentApprovalModal({
  branch,
  ownerIds,
  onClose,
  onSubmitted,
}: {
  branch: Branch;
  ownerIds: string[];
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [options, setOptions] = useState<BranchOptions | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyKey, setCompanyKey] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/payments/cost-approval/${branch}/preview?ids=${encodeURIComponent(ownerIds.join(","))}`,
          { cache: "no-store" },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "预填数据加载失败");
        if (cancelled) return;
        const branchOptions: BranchOptions = data.options ?? { company: [], customer: [], fee: [], invoice: [], currencies: ["USD"] };
        const nextCompanies: CompanyOption[] = data.companies ?? [];
        const previewRows: PreviewRow[] = data.rows ?? [];
        const defaultFee = branchOptions.fee.find((option) => option.text === "无")?.value ?? branchOptions.fee[0]?.value ?? "";
        const nextRows: DraftRow[] = previewRows.map((row) => ({
          ...row,
          feeOptionKey: defaultFee,
          invoiceOptionKey: row.invoiceIssued ? branchOptions.invoice[0]?.value ?? "" : branchOptions.invoice[1]?.value ?? "",
          customerOptionKey: matchCustomerOption(branchOptions.customer, row.customerName),
          accountId: row.bankAccounts.find((account) => account.isDefault)?.accountId ?? row.bankAccounts[0]?.accountId ?? "",
          attachments: [],
        }));
        setOptions(branchOptions);
        setCompanies(nextCompanies);
        setRows(nextRows);
        setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        setCompanyKey(
          previewRows[0]?.undertakingUnitCode
            ? nextCompanies.find((company) => company.code === previewRows[0].undertakingUnitCode)?.companyKey ?? ""
            : nextCompanies.find((company) => company.companyKey)?.companyKey ?? "",
        );
        setReason(defaultReason(branch, nextRows));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "预填数据加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [branch, ownerIds]);

  const totals = useMemo(() => {
    const byCurrency = new Map<string, number>();
    for (const row of rows) {
      const currency = String(row.currency ?? "");
      byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + Number(row.amount ?? 0));
    }
    return [...byCurrency.entries()].map(([currency, amount]) => `${formatDisplayValue(amount, "money")} ${currency}`).join(" + ");
  }, [rows]);

  const selectedCompany = companies.find((company) => company.companyKey === companyKey);

  function patchRow(ownerId: string, patch: Partial<DraftRow>) {
    setRows((current) => current.map((row) => (row.ownerId === ownerId ? { ...row, ...patch } : row)));
  }

  function pickAccount(row: DraftRow, accountId: string) {
    const account = row.bankAccounts.find((item) => item.accountId === accountId);
    patchRow(row.ownerId, {
      accountId,
      payee: account?.accountName ?? row.payee,
      bankName: account?.bankName ?? "",
      bankAccount: account?.bankAccount ?? "",
      swiftCode: account?.swiftCode ?? "",
    });
  }

  async function readFiles(row: DraftRow, files: FileList | null) {
    if (!files?.length) return;
    const next: Array<{ fileName: string; dataUrl: string }> = [];
    for (const file of Array.from(files)) next.push({ fileName: file.name, dataUrl: await readAsDataUrl(file) });
    patchRow(row.ownerId, { attachments: [...row.attachments, ...next] });
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/payments/cost-approval/${branch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          entries: rows.map((row) => ({
            ownerType: OWNER_TYPE[branch],
            ownerId: row.ownerId,
            ownerNo: row.ownerNo,
            period: row.period,
            undertakingUnitCode: row.undertakingUnitCode,
            companyKey,
            amount: Number(row.amount),
            currency: row.currency,
            payee: row.payee,
            bankAccount: row.bankAccount,
            bankName: row.bankName,
            swiftCode: row.swiftCode,
            feeOptionKey: row.feeOptionKey,
            invoiceOptionKey: row.invoiceOptionKey,
            paymentDate: row.paymentDate,
            invoiceIssued: row.invoiceOptionKey === options?.invoice[0]?.value,
            customerName: row.customerName,
            customerOptionKey: row.customerOptionKey,
            orderNo: row.orderNo,
            batchNo: row.batchNo,
            attachments: row.attachments,
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "发起付款申请失败");
      notify(`已发起飞书审批：${data.instanceCode}`, "success");
      onSubmitted?.();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "发起付款申请失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      description={`${BRANCH_TITLE[branch]} · 以你的飞书身份提交，审批通过后自动回写已付款`}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="min-w-0 truncate text-xs text-ink-3">
            合计 <span className="ml-1 text-sm font-medium text-ink">{totals || "-"}</span>
            {selectedCompany ? <span className="ml-2">· {selectedCompany.name}</span> : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button onClick={onClose} disabled={submitting}>取消</Button>
            <Button disabled={loading || submitting || !rows.length} onClick={() => void submit()} tone="primary">
              <Banknote size={15} />
              {submitting ? "发起中…" : "确认并发起审批"}
            </Button>
          </div>
        </div>
      }
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          发起成本款付款申请
          <span className="rounded bg-info-soft px-1.5 py-0.5 text-[11px] font-normal text-primary">{PROJECT_LABEL[branch]}</span>
        </span>
      }
      widthClass="max-w-3xl"
    >
      {error ? (
        <div className="mb-3 rounded border border-danger-border-strong bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {warnings.length ? (
        <div className="mb-3 rounded border border-warning-border-soft bg-warning-soft px-3 py-2 text-xs text-warning-ink">
          {warnings.map((warning) => <div key={warning} className="flex gap-1.5"><span>•</span><span>{warning}</span></div>)}
        </div>
      ) : null}

      {/* 摘要 */}
      <div className="mb-4 grid gap-px overflow-hidden rounded border border-line-soft bg-line-soft sm:grid-cols-3">
        <SummaryCell label="付款明细" value={`${rows.length || 0} 条`} />
        <SummaryCell label="合计金额" value={totals || "-"} />
        <SummaryCell label="成本部门 / 项目" value={`CLOUD / ${PROJECT_LABEL[branch]}`} />
      </div>

      {/* 基本信息 */}
      <section className="rounded border border-line-soft bg-white">
        <SectionHead icon={<Building2 size={14} />} title="基本信息" hint="成本部门与成本项目由入口决定，不用选" />
        <div className="divide-y divide-line-soft">
          <FormRow hint="审批单上的用途说明，尽量写清楚账期/项目" label="付款事由">
            <Textarea className="w-full" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          </FormRow>
          <FormRow hint="默认取来源单据的承接单位，可以改" label="成本公司">
            <Select className="w-full" value={companyKey} onChange={(event) => setCompanyKey(event.target.value)}>
              <option value="">请选择成本公司</option>
              {companies.map((company) => (
                <option disabled={!company.companyKey} key={company.code} value={company.companyKey || `unmapped:${company.code}`}>
                  {companyOptionLabel(options?.company, company.companyKey) || company.name}
                  {company.companyKey ? "" : "（飞书审批里还没对应选项）"}
                </option>
              ))}
            </Select>
          </FormRow>
        </div>
      </section>

      {/* 明细 */}
      <div className="mt-4 space-y-3">
        {loading ? <div className="rounded border border-line-soft bg-white p-8 text-center text-sm text-ink-3">加载中…</div> : null}
        {!loading && !rows.length ? <div className="rounded border border-line-soft bg-white p-8 text-center text-sm text-ink-3">没有可发起的数据</div> : null}
        {rows.map((row, index) => (
          <section className="overflow-clip rounded border border-line-soft bg-white" key={row.ownerId}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-soft bg-canvas px-4 py-2.5">
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-medium text-primary">
                {index + 1}
              </span>
              <span className="text-sm font-medium text-ink">{rowTitle(branch, row)}</span>
              <span className="text-xs text-ink-3">供应商 {row.supplierName || "-"}</span>
              {row.paid ? <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[11px] text-warning-ink">系统里已标记已付款</span> : null}
            </div>

            {/* 明细字段：标签在左、控件等宽满行（之前用多列网格，控件宽度不一） */}
            <div className="divide-y divide-line-soft">
              {branch === "huawei" ? (
                <FormRow hint="飞书审批里的选项" label="客户名称">
                  <Select className="w-full" value={row.customerOptionKey} onChange={(event) => patchRow(row.ownerId, { customerOptionKey: event.target.value })}>
                    <option value="">请选择客户</option>
                    {(options?.customer ?? []).map((option) => (
                      <option key={option.value} value={option.value}>{option.text}</option>
                    ))}
                  </Select>
                </FormRow>
              ) : null}
              <FormRow hint="默认取系统账单，可改" label="金额">
                <Input
                  className="w-full"
                  step="0.01"
                  type="number"
                  value={String(row.amount ?? "")}
                  onChange={(event) => patchRow(row.ownerId, { amount: Number(event.target.value) })}
                />
              </FormRow>
              <FormRow label="币种">
                <Select className="w-full" value={row.currency} onChange={(event) => patchRow(row.ownerId, { currency: event.target.value })}>
                  {Array.from(new Set([row.currency, ...(options?.currencies ?? [])].filter(Boolean))).map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </Select>
              </FormRow>
              <FormRow label="手续费">
                <Select className="w-full" value={row.feeOptionKey} onChange={(event) => patchRow(row.ownerId, { feeOptionKey: event.target.value })}>
                  {(options?.fee ?? []).map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
                </Select>
              </FormRow>
              <FormRow label="需求付款日期">
                <Input
                  className="w-full"
                  type="date"
                  value={row.paymentDate ? row.paymentDate.slice(0, 10) : ""}
                  onChange={(event) => patchRow(row.ownerId, { paymentDate: event.target.value })}
                />
              </FormRow>
              <FormRow label="发票">
                <Select className="w-full" value={row.invoiceOptionKey} onChange={(event) => patchRow(row.ownerId, { invoiceOptionKey: event.target.value })}>
                  {(options?.invoice ?? []).map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
                </Select>
              </FormRow>
            </div>

            {/* 收款账号：与上方字段同样的「标签左 + 内容右」等宽竖排 */}
            <div className="mx-4 mb-3 overflow-clip rounded border border-line-soft bg-canvas">
              <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2">
                <Banknote className="text-ink-3" size={14} />
                <span className="text-xs font-medium text-ink-2">收款账号</span>
                {row.bankAccounts.length > 1 ? (
                  <span className="ml-auto text-[11px] text-ink-3">该供应商有 {row.bankAccounts.length} 个账户，可切换</span>
                ) : null}
                {!row.bankAccounts.length ? (
                  <span className="text-xs text-warning-ink">供应商还没有银行账户，请先到供应商档案补</span>
                ) : null}
              </div>
              {row.bankAccounts.length > 1 ? (
                <div className="px-3 py-2">
                  <Select className="w-full" value={row.accountId} onChange={(event) => pickAccount(row, event.target.value)}>
                    {row.bankAccounts.map((account) => (
                      <option key={account.accountId} value={account.accountId}>
                        {account.accountName} · {account.bankAccount} · {account.currency || "-"}{account.isDefault ? "（默认）" : ""}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <div className="divide-y divide-line-soft/70">
                <AccountRow label="收款单位" value={row.payee} />
                <AccountRow label="银行账户" value={row.bankAccount} />
                <AccountRow label="开户行" value={row.bankName} />
                <AccountRow label="SWIFT CODE" value={row.swiftCode} />
              </div>
              {row.sources.length ? (
                <details className="border-t border-line-soft px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-ink-3 hover:text-primary">
                    <ChevronDown size={13} />
                    覆盖的客户 / 华为云账号（{row.sources.length} 个）
                  </summary>
                  <div className="mt-2 divide-y divide-line-soft/70 text-xs">
                    {row.sources.map((source) => (
                      <div className="flex items-center justify-between gap-3 py-1" key={`${source.customer}-${source.account}`}>
                        <span className="min-w-0 truncate text-ink-2">{source.customer || "-"} · <span className="text-ink-3">{source.account || "-"}</span></span>
                        <span className="shrink-0 tabular-nums text-ink-3">{formatDisplayValue(source.amount, "money")}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>

            {/* 附件 */}
            <div className="mx-4 mb-4 rounded border border-dashed border-line px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Paperclip className="text-ink-3" size={14} />
                <span className="text-xs text-ink-2">附件<span className="text-danger">*</span></span>
                <span className="text-[11px] text-ink-3">
                  {branch === "other" ? "发票上已传的附件会自动带上，可再补充" : "付款申请必须带附件（发票 / 合同）"}
                </span>
                <label className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1 rounded border border-line bg-white px-3 text-xs text-ink-2 transition-colors hover:border-primary hover:text-primary">
                  <Upload size={13} />选择文件
                  <input className="hidden" multiple type="file" onChange={(event) => { void readFiles(row, event.target.files); event.target.value = ""; }} />
                </label>
              </div>
              {row.attachments.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.attachments.map((attachment) => (
                    <span className="inline-flex max-w-[280px] items-center gap-2 rounded bg-canvas px-2 py-1 text-xs text-ink-2" key={attachment.fileName}>
                      <Paperclip className="shrink-0 text-ink-3" size={12} />
                      <span className="truncate">{attachment.fileName}</span>
                      <button
                        className="shrink-0 text-danger hover:underline"
                        onClick={() => patchRow(row.ownerId, { attachments: row.attachments.filter((item) => item !== attachment) })}
                        type="button"
                      >
                        移除
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-2.5">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium text-ink">{value}</div>
    </div>
  );
}

function SectionHead({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5">
      <span className="text-ink-3">{icon}</span>
      <span className="text-sm font-medium text-ink">{title}</span>
      {hint ? <span className="text-[11px] text-ink-3">{hint}</span> : null}
    </div>
  );
}

/** 表单行：标签在左固定宽度、控件在右占满剩余宽度 —— 所有控件宽度一致。 */
function FormRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] items-start gap-3 px-4 py-2.5">
      <div className="pt-2 text-xs text-ink-3">
        {label}
        {hint ? <div className="mt-0.5 text-[11px] leading-4 text-ink-4">{hint}</div> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] items-baseline gap-3 px-3 py-1.5 text-xs">
      <span className="text-ink-3">{label}</span>
      <span className="break-words text-ink-2">{value || "-"}</span>
    </div>
  );
}

function rowTitle(branch: Branch, row: DraftRow) {
  if (branch === "compute") return `${row.orderNo}${row.batchNo ? ` · 批次 ${row.batchNo}` : ""}`;
  if (branch === "huawei") return `${row.period} 账期`;
  return `发票 ${row.ownerNo || "-"}`;
}

function companyOptionLabel(options: Option[] | undefined, companyKey: string) {
  if (!companyKey) return "";
  return (options ?? []).find((option) => option.value === companyKey)?.text ?? "";
}

/** 系统客户名 → 审批客户选项：先精确匹配选项文字，再按已知别名匹配。 */
function matchCustomerOption(options: Option[], customerName: string) {
  const name = String(customerName ?? "").trim();
  if (!name) return "";
  const exact = options.find((option) => option.text === name);
  if (exact) return exact.value;
  const upper = name.toUpperCase();
  if (upper.includes("BANORTE")) return options.find((option) => option.text.toUpperCase().includes("BARNORTE"))?.value ?? "";
  if (name.includes("枭龙")) return options.find((option) => option.text.includes("枭龙"))?.value ?? "";
  if (name.includes("万博")) return options.find((option) => option.text.includes("万博"))?.value ?? "";
  return "";
}

/** 金额统一用千分位并保留两位小数，例如 85000 → 85,000.00。 */
export function formatApprovalAmount(value: unknown) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

type ReasonRow = Pick<
  DraftRow,
  | "period"
  | "supplierName"
  | "supplierFullName"
  | "amount"
  | "currency"
  | "projectNo"
  | "projectName"
  | "ownerNo"
  | "countryCode"
  | "countryName"
  | "batchNo"
  | "quantity"
  | "requestNos"
>;

/** 三个入口的付款事由默认文案；多条明细用中文分号连接。 */
export function defaultReason(branch: Branch, rows: ReasonRow[]) {
  return rows.map((row) => {
    const amount = `${formatApprovalAmount(row.amount)}${row.currency || ""}`;
    if (branch === "huawei") {
      const supplier = row.supplierFullName || row.supplierName || "-";
      return `支付华为云 ${row.period || "-"} 账期（${supplier}）货款金额：${amount}`;
    }
    if (branch === "other") {
      const project = row.projectName || row.projectNo || row.ownerNo || "-";
      return `支付集采项目${project}成本货款金额：${amount}`;
    }
    const country = row.countryName || row.countryCode || "";
    const batch = row.batchNo || "";
    const quantity = Number.isFinite(Number(row.quantity)) ? Math.round(Number(row.quantity)) : 0;
    const requestNos = row.requestNos.filter(Boolean);
    const requestText = requestNos.length
      ? `需求单号${requestNos[0]}${requestNos.slice(1).map((no) => `、(${no})`).join("")}`
      : "";
    const supplier = row.supplierFullName || row.supplierName || "-";
    return `${country}${batch}的${quantity}PCS，${requestText}支付${supplier}设备款，金额为${amount}`;
  }).join("；");
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`读取文件失败：${file.name}`));
    reader.readAsDataURL(file);
  });
}
