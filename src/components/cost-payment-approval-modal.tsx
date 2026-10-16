"use client";

/**
 * 成本款付款申请弹层（华为云供应商付款 / 集采发票汇总 / 算力采购订单共用）。
 *
 * 版式：**一条明细一张卡片、字段竖排**（早期是横向大表格，字段多了在窄屏上很难看）。
 * 可选项（客户名称 / 手续费 / 发票 / 币种 / 成本公司）优先用**飞书审批定义里读回来的选项**，
 * 审批后台加了新选项，这里会自动出现；读不到时回落到内置列表。
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Input, Panel, Select } from "./ui";
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
      description={`${BRANCH_TITLE[branch]} · ${rows.length} 条明细 · 合计 ${totals || "-"} · 以你的飞书身份提交`}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>取消</Button>
          <Button disabled={loading || submitting || !rows.length} onClick={() => void submit()} tone="primary">
            {submitting ? "发起中…" : "确认并发起审批"}
          </Button>
        </>
      }
      onClose={onClose}
      title="发起成本款付款申请"
      widthClass="max-w-4xl"
    >
      {error ? <div className="mb-3 rounded border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-strong">{error}</div> : null}
      {warnings.length ? (
        <div className="mb-3 rounded border border-[#f5dab1] bg-[#fdf6ec] px-3 py-2 text-xs text-[#8a5a00]">
          {warnings.map((warning) => <div key={warning}>· {warning}</div>)}
        </div>
      ) : null}

      {/* 表头信息：竖排字段 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="付款事由">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <Field label="成本部门 / 成本项目">
          <div className="flex h-9 items-center rounded border border-line-soft bg-surface-2 px-3 text-sm text-ink-2">
            CLOUD / {PROJECT_LABEL[branch]}
          </div>
        </Field>
        <Field label="成本公司（承接单位，可切换）">
          <Select value={companyKey} onChange={(event) => setCompanyKey(event.target.value)}>
            <option value="">请选择成本公司</option>
            {companies.map((company) => (
              <option disabled={!company.companyKey} key={company.code} value={company.companyKey || `unmapped:${company.code}`}>
                {companyOptionLabel(options?.company, company.companyKey) || company.name}
                {company.companyKey ? "" : "（飞书审批里还没对应选项）"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="合计">
          <div className="flex h-9 items-center rounded border border-line-soft bg-surface-2 px-3 text-sm font-medium text-ink">{totals || "-"}</div>
        </Field>
      </div>

      <div className="mt-4 space-y-4">
        {loading ? <Panel className="p-6 text-center text-sm text-ink-3">加载中…</Panel> : null}
        {!loading && !rows.length ? <Panel className="p-6 text-center text-sm text-ink-3">没有可发起的数据</Panel> : null}
        {rows.map((row, index) => (
          <Panel className="p-4" key={row.ownerId}>
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-soft pb-2 text-sm">
              <span className="font-medium text-ink">明细 {index + 1}</span>
              {branch === "compute" ? <span className="text-ink-2">订单号 {row.orderNo}</span> : null}
              {branch === "compute" ? <span className="text-ink-2">批次序号 {row.batchNo || "-"}</span> : null}
              {branch !== "compute" ? <span className="text-ink-2">{branch === "huawei" ? `账期 ${row.period}` : `发票号 ${row.ownerNo}`}</span> : null}
              <span className="text-ink-2">供应商 {row.supplierName || "-"}</span>
              {row.paid ? <span className="text-[#b8860b]">已标记为已付款</span> : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {branch === "huawei" ? (
                <Field label="客户名称（审批选项）">
                  <Select value={row.customerOptionKey} onChange={(event) => patchRow(row.ownerId, { customerOptionKey: event.target.value })}>
                    <option value="">请选择客户</option>
                    {(options?.customer ?? []).map((option) => (
                      <option key={option.value} value={option.value}>{option.text}</option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Field label="金额（默认取系统账单，可改）">
                <Input
                  step="0.01"
                  type="number"
                  value={String(row.amount ?? "")}
                  onChange={(event) => patchRow(row.ownerId, { amount: Number(event.target.value) })}
                />
              </Field>
              <Field label="币种（审批允许的币种）">
                <Select value={row.currency} onChange={(event) => patchRow(row.ownerId, { currency: event.target.value })}>
                  {Array.from(new Set([row.currency, ...(options?.currencies ?? [])].filter(Boolean))).map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </Select>
              </Field>
              <Field label="手续费（分摊方案）">
                <Select value={row.feeOptionKey} onChange={(event) => patchRow(row.ownerId, { feeOptionKey: event.target.value })}>
                  {(options?.fee ?? []).map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
                </Select>
              </Field>
              <Field label="需求付款日期">
                <Input
                  type="date"
                  value={row.paymentDate ? row.paymentDate.slice(0, 10) : ""}
                  onChange={(event) => patchRow(row.ownerId, { paymentDate: event.target.value })}
                />
              </Field>
              <Field label="发票">
                <Select value={row.invoiceOptionKey} onChange={(event) => patchRow(row.ownerId, { invoiceOptionKey: event.target.value })}>
                  {(options?.invoice ?? []).map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
                </Select>
              </Field>
            </div>

            {/* 收款/账号信息：单独一块，完整展示 */}
            <div className="mt-3 rounded border border-line-soft bg-surface-2 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs text-ink-3">收款账号信息</span>
                {row.bankAccounts.length > 1 ? (
                  <Select className="w-[320px]" value={row.accountId} onChange={(event) => pickAccount(row, event.target.value)}>
                    {row.bankAccounts.map((account) => (
                      <option key={account.accountId} value={account.accountId}>
                        {account.accountName} · {account.bankAccount}{account.isDefault ? "（默认）" : ""}
                      </option>
                    ))}
                  </Select>
                ) : null}
                {!row.bankAccounts.length ? <span className="text-xs text-[#b8860b]">供应商还没有银行账户，请先到供应商档案补</span> : null}
              </div>
              <div className="grid gap-x-6 gap-y-1 text-sm text-ink-2 sm:grid-cols-2">
                <div>收款单位：<span className="text-ink">{row.payee || "-"}</span></div>
                <div>银行账户：<span className="text-ink">{row.bankAccount || "-"}</span></div>
                <div>开户行：<span className="text-ink">{row.bankName || "-"}</span></div>
                <div>SWIFT CODE：<span className="text-ink">{row.swiftCode || "-"}</span></div>
              </div>
              {row.sources.length ? (
                <div className="mt-2 border-t border-line-soft pt-2 text-xs text-ink-3">
                  <div className="mb-1">覆盖的客户 / 华为云账号（{row.sources.length} 个）：</div>
                  <div className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                    {row.sources.map((source) => (
                      <div className="flex items-center justify-between gap-2" key={`${source.customer}-${source.account}`}>
                        <span className="truncate">{source.customer || "-"} · {source.account || "-"}</span>
                        <span className="shrink-0 tabular-nums">{formatDisplayValue(source.amount, "money")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-3">
              <div className="mb-1 text-xs text-ink-3">
                附件（必填）{branch === "other" ? " · 发票上已传的附件会在提交时自动带上" : ""}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {row.attachments.map((attachment) => (
                  <span className="inline-flex items-center gap-2 rounded border border-line-soft bg-white px-2 py-1 text-xs text-ink-2" key={attachment.fileName}>
                    <span className="max-w-[220px] truncate">{attachment.fileName}</span>
                    <button
                      className="text-danger hover:underline"
                      onClick={() => patchRow(row.ownerId, { attachments: row.attachments.filter((item) => item !== attachment) })}
                      type="button"
                    >
                      移除
                    </button>
                  </span>
                ))}
                <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded border border-line bg-white px-3 text-xs text-ink-2 hover:border-primary hover:text-primary">
                  + 上传附件
                  <input className="hidden" multiple type="file" onChange={(event) => { void readFiles(row, event.target.files); event.target.value = ""; }} />
                </label>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      {selectedCompany ? (
        <div className="mt-3 text-xs text-ink-3">成本公司将按「{selectedCompany.name}」提交到审批。</div>
      ) : null}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-3">{label}</span>
      {children}
    </label>
  );
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

function defaultReason(branch: Branch, rows: DraftRow[]) {
  const first = rows[0];
  if (branch === "huawei") return `支付华为云 ${first?.period ?? ""} 账期供应商货款`;
  if (branch === "other") return `支付项目成本发票货款${first?.ownerNo ? `（发票 ${first.ownerNo}）` : ""}`;
  return `支付算力采购订单货款（${rows.length} 张）`;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`读取文件失败：${file.name}`));
    reader.readAsDataURL(file);
  });
}
