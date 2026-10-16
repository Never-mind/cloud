"use client";

/**
 * 成本款付款申请弹层（华为云供应商付款 / 集采发票汇总 / 算力采购订单共用）。
 *
 * 三个入口只是 branch 不同、明细分支字段不同：
 *   huawei  华为云：多一列「客户名称」，由发起人从审批现有选项里选
 *   other   集采：金额 / 收款账户 / 手续费 / 付款日期 / 发票 / 附件
 *   compute 算力：多「订单号、批次序号」，支持多张采购订单合并成一张审批
 *
 * 预填数据全部来自 /api/payments/cost-approval/{branch}/preview，前端只做选择与补填。
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Input, Select } from "./ui";
import { Modal } from "./modal";
import { notify } from "./app-dialog";
import { formatDisplayValue } from "@/lib/display-format";

type Branch = "huawei" | "other" | "compute";

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
  orderNo: string;
  batchNo: string;
  paid: boolean;
  bankAccounts: BankAccount[];
};

type DraftRow = PreviewRow & {
  feeKey: string;
  accountId: string;
  attachments: Array<{ fileName: string; dataUrl: string }>;
};

/** 华为云审批里「客户名称」现有的三个选项（value 用系统客户名，提交时按名字映射到选项 key）。 */
const HUAWEI_CUSTOMER_OPTIONS = [
  { value: "枭龙云", label: "枭龙云" },
  { value: "Afore banorte", label: "Barnorte（AFORE XXI BANORTE）" },
  { value: "万博", label: "万博" },
];

const BRANCH_TITLE: Record<Branch, string> = {
  huawei: "华为云业务 · 供应商付款",
  other: "集采系统 · 发票汇总",
  compute: "算力系统 · 采购订单",
};

const FEE_OPTIONS = [
  { value: "none", label: "无" },
  { value: "ours", label: "我方全额承担" },
  { value: "theirs", label: "对方全额承担" },
  { value: "shared", label: "共同承担" },
];

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
        const nextRows: DraftRow[] = (data.rows ?? []).map((row: PreviewRow) => ({
          ...row,
          feeKey: "none",
          accountId: row.bankAccounts.find((account) => account.isDefault)?.accountId ?? row.bankAccounts[0]?.accountId ?? "",
          attachments: [],
        }));
        setRows(nextRows);
        setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
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
    const amount = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    return { amount, currency: rows[0]?.currency ?? "" };
  }, [rows]);

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
    for (const file of Array.from(files)) {
      next.push({ fileName: file.name, dataUrl: await readAsDataUrl(file) });
    }
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
            amount: Number(row.amount),
            currency: row.currency,
            payee: row.payee,
            bankAccount: row.bankAccount,
            bankName: row.bankName,
            swiftCode: row.swiftCode,
            feeKey: row.feeKey,
            paymentDate: row.paymentDate,
            invoiceIssued: row.invoiceIssued,
            customerName: row.customerName,
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
      description={`${BRANCH_TITLE[branch]} · 共 ${rows.length} 条明细 · 合计 ${formatDisplayValue(totals.amount, "money")} ${totals.currency} · 以你的飞书身份提交`}
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
      widthClass="max-w-6xl"
    >
      {error ? <div className="mb-3 rounded border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-strong">{error}</div> : null}
      {warnings.length ? (
        <div className="mb-3 rounded border border-[#f5dab1] bg-[#fdf6ec] px-3 py-2 text-xs text-[#8a5a00]">
          {warnings.map((warning) => <div key={warning}>· {warning}</div>)}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs text-ink-3">付款事由</span>
          <Input className="w-full" value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <div>
          <span className="mb-1 block text-xs text-ink-3">成本部门 / 成本项目</span>
          <div className="flex h-9 items-center gap-2 rounded border border-line-soft bg-surface-2 px-3 text-sm text-ink-2">
            CLOUD / {branch === "huawei" ? "华为云" : branch === "compute" ? "算力" : "其他"}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-xs text-ink-3">成本公司（承接单位）</span>
          <div className="flex h-9 items-center rounded border border-line-soft bg-surface-2 px-3 text-sm text-ink-2">
            {rows[0]?.undertakingUnitName || "-"}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1200px] border-collapse text-sm">
          <thead className="bg-canvas text-ink">
            <tr>
              {branch === "compute" ? <th className="border-b border-r border-line-soft px-3 py-2 text-left font-medium">订单号</th> : null}
              {branch === "compute" ? <th className="border-b border-r border-line-soft px-3 py-2 text-left font-medium">批次序号</th> : null}
              {branch === "huawei" ? <th className="border-b border-r border-line-soft px-3 py-2 text-left font-medium">客户名称</th> : null}
              {branch !== "compute" ? <th className="border-b border-r border-line-soft px-3 py-2 text-left font-medium">{branch === "huawei" ? "账期" : "发票号"}</th> : null}
              <th className="border-b border-r border-line-soft px-3 py-2 text-left font-medium">金额</th>
              <th className="border-b border-r border-line-soft px-3 py-2 text-left font-medium">收款账户</th>
              <th className="border-b border-r border-line-soft px-3 py-2 text-left font-medium">手续费</th>
              <th className="border-b border-r border-line-soft px-3 py-2 text-left font-medium">需求付款日期</th>
              <th className="border-b border-r border-line-soft px-3 py-2 text-left font-medium">发票</th>
              <th className="border-b border-line-soft px-3 py-2 text-left font-medium">附件</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-10 text-center text-ink-3" colSpan={10}>加载中…</td></tr>
            ) : null}
            {!loading && rows.map((row) => (
              <tr key={row.ownerId}>
                {branch === "compute" ? <td className="border-b border-r border-line-soft px-3 py-2 text-ink-2">{row.orderNo}</td> : null}
                {branch === "compute" ? <td className="border-b border-r border-line-soft px-3 py-2 text-ink-2">{row.batchNo || "-"}</td> : null}
                {branch === "huawei" ? (
                  <td className="border-b border-r border-line-soft px-3 py-2">
                    <Select className="w-[196px]" value={row.customerName} onChange={(event) => patchRow(row.ownerId, { customerName: event.target.value })}>
                      <option value="">请选择客户</option>
                      {HUAWEI_CUSTOMER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                  </td>
                ) : null}
                {branch !== "compute" ? <td className="border-b border-r border-line-soft px-3 py-2 text-ink-2">{row.ownerNo}</td> : null}
                <td className="border-b border-r border-line-soft px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Input
                      className="w-[130px]"
                      type="number"
                      step="0.01"
                      value={String(row.amount ?? "")}
                      onChange={(event) => patchRow(row.ownerId, { amount: Number(event.target.value) })}
                    />
                    <span className="text-xs text-ink-3">{row.currency}</span>
                  </div>
                </td>
                <td className="border-b border-r border-line-soft px-3 py-2">
                  {row.bankAccounts.length > 1 ? (
                    <Select className="w-[220px]" value={row.accountId} onChange={(event) => pickAccount(row, event.target.value)}>
                      {row.bankAccounts.map((account) => (
                        <option key={account.accountId} value={account.accountId}>
                          {account.accountName} · {account.bankAccount}{account.isDefault ? "（默认）" : ""}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <div className="text-xs text-ink-2">
                      {row.bankAccounts.length ? `${row.payee} · ${row.bankAccount}` : <span className="text-[#b8860b]">供应商还没有银行账户</span>}
                    </div>
                  )}
                  {row.bankAccounts.length ? (
                    <div className="mt-0.5 text-[11px] text-ink-3">{row.bankName} · SWIFT {row.swiftCode || "-"}</div>
                  ) : null}
                </td>
                <td className="border-b border-r border-line-soft px-3 py-2">
                  <Select className="w-[132px]" value={row.feeKey} onChange={(event) => patchRow(row.ownerId, { feeKey: event.target.value })}>
                    {FEE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </td>
                <td className="border-b border-r border-line-soft px-3 py-2">
                  <Input
                    className="w-[140px]"
                    type="date"
                    value={row.paymentDate ? row.paymentDate.slice(0, 10) : ""}
                    onChange={(event) => patchRow(row.ownerId, { paymentDate: event.target.value })}
                  />
                </td>
                <td className="border-b border-r border-line-soft px-3 py-2">
                  <Select
                    className="w-[92px]"
                    value={row.invoiceIssued ? "issued" : "not"}
                    onChange={(event) => patchRow(row.ownerId, { invoiceIssued: event.target.value === "issued" })}
                  >
                    <option value="issued">已开</option>
                    <option value="not">未开</option>
                  </Select>
                </td>
                <td className="border-b border-line-soft px-3 py-2">
                  <div className="space-y-1">
                    {row.attachments.map((attachment) => (
                      <div className="flex items-center gap-2 text-xs text-ink-2" key={attachment.fileName}>
                        <span className="max-w-[180px] truncate">{attachment.fileName}</span>
                        <button
                          className="text-danger hover:underline"
                          onClick={() => patchRow(row.ownerId, { attachments: row.attachments.filter((item) => item !== attachment) })}
                          type="button"
                        >
                          移除
                        </button>
                      </div>
                    ))}
                    <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-primary hover:underline">
                      <input className="hidden" multiple type="file" onChange={(event) => { void readFiles(row, event.target.files); event.target.value = ""; }} />
                      + 上传附件
                    </label>
                    <div className="text-[11px] text-ink-3">
                      {branch === "other" ? "发票已有附件会在提交时自动带上" : "付款申请必须带附件"}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !rows.length ? <tr><td className="px-3 py-10 text-center text-ink-3" colSpan={10}>没有可发起的数据</td></tr> : null}
          </tbody>
        </table>
      </div>
    </Modal>
  );
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
