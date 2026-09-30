"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, FileUp, Link2, RefreshCw, Search, Settings2 } from "lucide-react";
import { Button, Input, Panel, Select } from "./ui";
import { Modal } from "./modal";
import { PaginationBar } from "./pagination-bar";
import { StickyTable } from "./sticky-table";
import { EmptyState, LoadingBlock } from "./table-state";
import { confirmDialog, notify } from "./app-dialog";
import { formatDisplayValue, formatMoneyValue } from "@/lib/display-format";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { CrmInvoiceAllocationModal } from "./crm-invoice-allocation-modal";

type Row = Record<string, unknown>;
type Kind = "invoices" | "receipts";

type MasterCustomer = { id: string; code?: string; name: string; shortName?: string };

type Identity = {
  subjectName: string;
  shortName: string;
  subjectKey: string;
  shortKey: string;
  invoiceCount: number;
  latestMonth: string;
  customerId: string;
  customerName: string;
  source: string;
  mappingId: string;
};

const BACKFILL_TONES: Record<string, string> = {
  backfilled: "bg-success-soft text-success",
  mismatch: "bg-danger-soft text-danger",
  unmatched: "bg-warning-soft text-warning",
  void: "bg-canvas text-ink-3",
  pending: "bg-canvas text-ink-3",
};

function tag(text: string, tone: string) {
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${tone}`}>{text}</span>;
}

/** 行数据是宽泛的 Record，这里统一收敛成展示层的可空值。 */
function show(value: unknown, type?: string) {
  return formatDisplayValue(value as string | number | boolean | Date | null | undefined, type);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "请求失败");
  return data as T;
}

/**
 * 华为云 → 账期发票（CRM）。
 *
 * CRM OpenAPI 只读，这里做三件事：把发票/回款同步成本地副本、维护 CRM 客户映射、
 * 把发票与回款按账期回填到本地对账行的「客户开票 / 客户实收」字段。
 */
export function CloudCrmInvoicesPanel() {
  const [kind, setKind] = useState<Kind>("invoices");
  const [month, setMonth] = useState("");
  const [keyword, setKeyword] = useState("");
  const [matchStatus, setMatchStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [currencyTotals, setCurrencyTotals] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row>({});
  const [lastRun, setLastRun] = useState<Row | null>(null);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [customers, setCustomers] = useState<MasterCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncMonth, setSyncMonth] = useState("");
  const [syncReceipts, setSyncReceipts] = useState(true);
  const [syncAttachments, setSyncAttachments] = useState(true);
  const [syncDryRun, setSyncDryRun] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingDraft, setMappingDraft] = useState<Record<string, string>>({});
  const [allocationTarget, setAllocationTarget] = useState<{ crmInvoiceId: number | string } | null>(null);

  const load = useCallback(async (targetPage = page, targetSize = pageSize) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ kind, page: String(targetPage), pageSize: String(targetSize) });
      if (month) params.set("month", month);
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (kind === "invoices" && matchStatus) params.set("matchStatus", matchStatus);
      const data = await requestJson<{ items: Row[]; total: number; currencyTotals?: Row[]; summary?: Row }>(`/api/cloud/crm-invoices?${params}`);
      setItems(data.items ?? []);
      setTotal(Number(data.total ?? 0));
      setCurrencyTotals(data.currencyTotals ?? []);
      setSummary(data.summary ?? {});
    } catch (error) {
      notify(error instanceof Error ? error.message : "CRM 数据加载失败", "info");
    } finally {
      setLoading(false);
    }
  }, [kind, month, keyword, matchStatus, page, pageSize]);

  const loadMeta = useCallback(async () => {
    try {
      const [mappingData, runData, masterData] = await Promise.all([
        requestJson<{ items: Identity[] }>("/api/cloud/crm-invoices?view=mappings"),
        requestJson<{ run: Row | null }>("/api/cloud/crm-invoices?view=last-run"),
        requestJson<{ customers: MasterCustomer[] }>("/api/cloud/master-data"),
      ]);
      setIdentities(mappingData.items ?? []);
      setLastRun(runData.run ?? null);
      setCustomers(masterData.customers ?? []);
    } catch { /* 元数据失败不影响列表 */ }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadMeta(); }, [loadMeta]);

  async function runSync() {
    setBusy(true);
    try {
      const months = syncMonth.split(/[,，\s]+/).map((value) => value.trim()).filter(Boolean);
      const result = await requestJson<Record<string, number | string>>("/api/cloud/crm-invoices/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months, includeReceipts: syncReceipts, downloadAttachments: syncAttachments, dryRun: syncDryRun }),
      });
      setNotice(
        `${syncDryRun ? "预演完成（未写入）" : "同步完成"}：发票读取 ${result.invoiceFetched} 张（新增 ${result.invoiceCreated ?? 0}、更新 ${result.invoiceUpdated ?? 0}、作废 ${result.invoiceVoided}），`
        + `回款 ${result.receiptFetched} 条，回填 ${result.backfilled}，差异 ${result.mismatch}，未匹配 ${result.unmatched}`
        + (result.attachmentDownloaded ? `，附件 ${result.attachmentDownloaded} 个` : "")
        + (result.attachmentLinked ? `，挂到对账明细 ${result.attachmentLinked} 个` : "")
        + (Number(result.attachmentFailed ?? 0) ? `，附件失败 ${result.attachmentFailed}` : "")
        + (Array.isArray((result as unknown as { errors?: unknown[] }).errors) && (result as unknown as { errors: unknown[] }).errors.length ? `；有 ${(result as unknown as { errors: unknown[] }).errors.length} 条错误` : ""),
      );
      setSyncOpen(false);
      await Promise.all([load(1), loadMeta()]);
      setPage(1);
    } catch (error) {
      notify(error instanceof Error ? error.message : "同步失败", "info");
    } finally {
      setBusy(false);
    }
  }

  async function saveMapping(identity: Identity) {
    const customerId = mappingDraft[identity.subjectKey || identity.shortKey];
    if (!customerId) { notify("请先选择本地客户", "info"); return; }
    try {
      await requestJson("/api/cloud/crm-invoices/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crmValue: identity.subjectName || identity.shortName, matchField: identity.subjectName ? "customerSubjectName" : "customerShortName", customerId }),
      });
      setNotice("映射已保存，下次同步自动套用");
      await Promise.all([loadMeta(), load()]);
    } catch (error) {
      notify(error instanceof Error ? error.message : "映射保存失败", "info");
    }
  }

  async function clearMapping(identity: Identity) {
    const key = identity.subjectKey || identity.shortKey;
    if (!await confirmDialog(`确认清除「${identity.subjectName || identity.shortName}」的客户映射吗？`)) return;
    if (!identity.mappingId) { notify("该客户还没有保存过映射", "info"); return; }
    try {
      await requestJson(`/api/cloud/crm-invoices/mappings?id=${encodeURIComponent(identity.mappingId)}`, { method: "DELETE" });
      setMappingDraft((current) => ({ ...current, [key]: "" }));
      await Promise.all([loadMeta(), load()]);
    } catch (error) {
      notify(error instanceof Error ? error.message : "映射清除失败", "info");
    }
  }

  const unmatchedIdentities = identities.filter((identity) => !identity.customerId);
  const invoiceCount = Number(summary.invoiceCount ?? 0);
  const voidCount = Number(summary.voidCount ?? 0);
  const unmatchedCount = Number(summary.unmatchedCount ?? 0);
  const mismatchCount = Number(summary.mismatchCount ?? 0);
  const noRowCount = Number(summary.noRowCount ?? 0);
  const backfilledCount = Number(summary.backfilledCount ?? 0);

  return (
    <Panel className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-end gap-2 border-b border-line-soft p-3">
        <div className="flex h-9 items-center gap-1 rounded border border-line bg-canvas px-1">
          {(["invoices", "receipts"] as Kind[]).map((option) => (
            <button
              className={`h-7 rounded px-3 text-xs ${kind === option ? "bg-white text-primary shadow-sm" : "text-ink-2 hover:text-primary"}`}
              key={option}
              onClick={() => { setKind(option); setPage(1); }}
              type="button"
            >
              {option === "invoices" ? "发票" : "回款"}
            </button>
          ))}
        </div>
        <Input className="w-[130px]" placeholder="归属月份 2026-09" value={month} onChange={(event) => { setMonth(event.target.value); setPage(1); }} />
        {kind === "invoices" ? (
          <Select className="w-[140px]" value={matchStatus} onChange={(event) => { setMatchStatus(event.target.value); setPage(1); }}>
            <option value="">全部匹配状态</option>
            <option value="unmatched">未匹配</option>
            <option value="mismatch">与本地不一致</option>
          </Select>
        ) : null}
        <Input
          className="w-[220px]"
          placeholder={kind === "invoices" ? "搜索发票号、客户、主体" : "搜索发票号、客户、流水号"}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { setPage(1); void load(1); } }}
        />
        <Button onClick={() => { setPage(1); void load(1); }}><Search size={15} />查询</Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-3">
            {lastRun ? `上次同步：${show(lastRun.finishedAt ?? lastRun.startedAt, "datetime")}（发票 ${lastRun.invoiceFetched ?? 0} 张）` : "尚未同步过"}
          </span>
          <Button onClick={() => setMappingOpen(true)}><Settings2 size={15} />客户映射{unmatchedIdentities.length ? <span className="ml-1 rounded-full bg-danger px-1.5 text-xs text-white">{unmatchedIdentities.length}</span> : null}</Button>
          <Button onClick={() => window.open(`/api/cloud/crm-invoices/export?kind=${kind}${month ? `&month=${encodeURIComponent(month)}` : ""}${keyword.trim() ? `&keyword=${encodeURIComponent(keyword.trim())}` : ""}`, "_blank")}><Download size={15} />导出</Button>
          <Button tone="primary" onClick={() => { setSyncMonth(month); setSyncOpen(true); }}><RefreshCw size={15} />从 CRM 同步</Button>
        </div>
      </div>

      <div className="grid gap-2 border-b border-line-soft p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded border border-line-soft bg-canvas px-3 py-2"><span className="block text-xs text-ink-3">{kind === "invoices" ? "本账期发票" : "本账期回款"}</span><strong className="text-base">{kind === "invoices" ? `${invoiceCount} 张` : `${Number(summary.receiptCount ?? 0)} 条`}</strong></div>
        {currencyTotals.map((totals) => (
          <div className="rounded border border-line-soft bg-canvas px-3 py-2" key={String(totals.currency)}>
            <span className="block text-xs text-ink-3">含税合计（{String(totals.currency || "-")}）</span>
            <strong className="text-base">{formatMoneyValue(kind === "invoices" ? totals.amountTaxIncluded : totals.receiptAmount)}</strong>
          </div>
        ))}
        {kind === "invoices" ? (
          <>
            <div className="rounded border border-success-soft bg-success-soft px-3 py-2"><span className="block text-xs text-success">已回填本地</span><strong className="text-base text-success">{backfilledCount}</strong></div>
            <div className="rounded border border-danger-soft bg-danger-soft px-3 py-2"><span className="block text-xs text-danger">未配置客户映射</span><strong className="text-base text-danger">{unmatchedCount}</strong></div>
            <div className="rounded border border-warning-soft bg-warning-soft px-3 py-2"><span className="block text-xs text-warning">本地无对账行</span><strong className="text-base text-warning">{noRowCount}</strong></div>
            <div className="rounded border border-warning-soft bg-warning-soft px-3 py-2"><span className="block text-xs text-warning">与本地不一致</span><strong className="text-base text-warning">{mismatchCount}</strong></div>
            <div className="rounded border border-line-soft bg-canvas px-3 py-2"><span className="block text-xs text-ink-3">已作废（不回填）</span><strong className="text-base">{voidCount}</strong></div>
          </>
        ) : null}
      </div>

      {kind === "invoices" && unmatchedIdentities.length ? (
        <div className="flex flex-wrap items-center gap-2 border border-info-border bg-info-soft px-3 py-2 text-xs text-primary">
          <AlertTriangle size={14} />
          <span>有 {unmatchedIdentities.length} 个 CRM 客户还没做映射，发票暂时无法回填到本地对账行：{unmatchedIdentities.slice(0, 4).map((identity) => identity.shortName || identity.subjectName).join("、")}{unmatchedIdentities.length > 4 ? " 等" : ""}</span>
          <button className="ml-auto underline" onClick={() => setMappingOpen(true)} type="button">去维护映射</button>
        </div>
      ) : null}

      {notice ? <div className="border-b border-line-soft bg-success-soft px-3 py-2 text-xs text-success">{notice}</div> : null}

      <div className="min-h-0 flex-1">
        <StickyTable className="table-scroll h-full w-full overflow-auto" tableKey={`cloud-crm-${kind}`}>
          {kind === "invoices" ? (
            <table className="w-full min-w-[1500px] border-collapse text-sm">
              <thead className="bg-canvas">
                <tr>
                  {["归属月份", "发票号", "CRM 客户", "本地客户", "产品服务", "币种", "不含税", "税额", "含税", "开票日期", "到期日", "类型", "状态", "分摊", "回填", "附件", "操作"].map((label) => (
                    <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium" key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr className="hover:bg-surface-2" key={String(row.id)}>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.belongMonth ?? "-")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 font-medium">{String(row.invoiceNo ?? "-")}</td>
                    <td className="border-b border-r border-line-soft px-3 py-2">
                      <span className="block">{String(row.customerShortName ?? "-")}</span>
                      <span className="block text-xs text-ink-3">{String(row.customerSubjectName ?? "")}</span>
                    </td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">
                      {row.customerName ? String(row.customerName) : tag("未匹配", "bg-warning-soft text-warning")}
                    </td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.productServiceName ?? "-")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.currency ?? "-")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">{formatMoneyValue(row.amountTaxExcluded)}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">{formatMoneyValue(row.taxAmount)}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">{formatMoneyValue(row.amountTaxIncluded)}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{show(row.invoiceDate)}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{show(row.dueDate)}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.invoiceTypeLabel ?? "-")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">
                      {String(row.invoiceStatus) === "2" ? tag("已作废", "bg-canvas text-ink-3") : tag(String(row.invoiceStatusLabel ?? "-"), "bg-success-soft text-success")}
                    </td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">
                      {row.allocationLabel
                        ? (
                          <button
                            className={`rounded px-1.5 py-0.5 text-xs ${Number(row.allocationCount ?? 0) ? "bg-success-soft text-success" : "bg-info-soft text-primary"} hover:underline`}
                            onClick={() => setAllocationTarget({ crmInvoiceId: row.crmInvoiceId as number })}
                            title={Array.isArray(row.allocations) && row.allocations.length
                              ? (row.allocations as Row[]).map((item) => `${item.period} ${item.account} ${formatMoneyValue(item.amountTaxIncluded)}`).join("\n")
                              : "点击按账期拆分这张发票"}
                            type="button"
                          >
                            {String(row.allocationLabel)}
                          </button>
                        )
                        : <span className="text-xs text-ink-4">单行匹配</span>}
                    </td>
                    <td className="border-b border-r border-line-soft px-3 py-2" title={String(row.backfillNote ?? "")}>
                      {tag(String(row.backfillStatusLabel ?? "-"), BACKFILL_TONES[String(row.backfillStatus ?? "")] ?? "bg-canvas text-ink-3")}
                    </td>
                    <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">
                      {row.attachmentId
                        ? <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`/api/cloud/attachments/${encodeURIComponent(String(row.attachmentId))}`} title="下载发票 PDF"><FileUp size={13} />PDF</a>
                        : row.attachmentUrl ? <span className="text-xs text-ink-3" title={String(row.attachmentUrl)}>未下载</span> : "-"}
                      {row.rowAttachmentId
                        ? <a className="ml-2 inline-flex items-center rounded bg-info-soft px-1.5 py-0.5 text-xs text-primary hover:underline" href={`/api/cloud/attachments/${encodeURIComponent(String(row.rowAttachmentId))}`} title="已挂到对账行的「客户开票附件」，点这里下载这份明细附件">已挂明细</a>
                        : null}
                    </td>
                    <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">
                      <button
                        className="rounded border border-line bg-white px-2 py-0.5 text-xs text-ink-2 hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={String(row.invoiceStatus) === "2"}
                        onClick={() => setAllocationTarget({ crmInvoiceId: row.crmInvoiceId as number })}
                        title="匹配到对账明细（支持跨账期拆分）"
                        type="button"
                      >
                        匹配
                      </button>
                    </td>
                  </tr>
                ))}
                {!items.length ? <tr><td className="py-12 text-center text-ink-3" colSpan={17}>{loading ? <LoadingBlock /> : <EmptyState title="暂无 CRM 发票，先点右上角「从 CRM 同步」" />}</td></tr> : null}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[1400px] border-collapse text-sm">
              <thead className="bg-canvas">
                <tr>
                  {["到账月份", "CRM 客户", "本地客户", "付款方", "币种", "回款金额", "匹配状态", "关联发票号", "收款银行", "银行流水号", "回填", "说明"].map((label) => (
                    <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium" key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr className="hover:bg-surface-2" key={String(row.id)}>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.arrivalMonth ?? "-")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.customerShortName ?? "-")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{row.customerName ? String(row.customerName) : tag("未匹配", "bg-warning-soft text-warning")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.payerName ?? "-")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.currency ?? "-")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">{formatMoneyValue(row.receiptAmount)}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.receiptStatusLabel ?? "-")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.invoiceNos ?? "-")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.receivingBank ?? "-")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.bankSerialNo ?? "-")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{tag(String(row.backfillStatusLabel ?? "-"), BACKFILL_TONES[String(row.backfillStatus ?? "")] ?? "bg-canvas text-ink-3")}</td>
                    <td className="border-b border-line-soft px-3 py-2 text-xs text-ink-3" title={String(row.backfillNote ?? "")}>{String(row.backfillNote ?? "")}</td>
                  </tr>
                ))}
                {!items.length ? <tr><td className="py-12 text-center text-ink-3" colSpan={12}>{loading ? <LoadingBlock /> : <EmptyState title="暂无 CRM 回款，先点右上角「从 CRM 同步」" />}</td></tr> : null}
              </tbody>
            </table>
          )}
        </StickyTable>
      </div>

      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(next) => { setPage(next); void load(next); }}
        onPageSizeChange={(next) => { setPageSize(next); setPage(1); void load(1, next); }}
      />

      {syncOpen ? (
        <Modal
          description="从 CRM OpenAPI 拉取发票（可选回款）生成/更新本地副本，并按账期回填到对账行。默认同步最近 3 个月。"
          footer={<><Button onClick={() => setSyncOpen(false)}>取消</Button><Button disabled={busy} tone="primary" onClick={() => void runSync()}>{busy ? "同步中…" : syncDryRun ? "开始预演" : "开始同步"}</Button></>}
          onClose={() => setSyncOpen(false)}
          title="从 CRM 同步发票"
          widthClass="max-w-xl"
        >
          <div className="space-y-3">
            <label className="block space-y-1 text-sm text-ink-2">
              <span>账期（YYYY-MM，留空=最近 3 个月，可填多个用逗号分隔）</span>
              <Input className="w-full" placeholder="例如 2026-09,2026-08" value={syncMonth} onChange={(event) => setSyncMonth(event.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-2"><input checked={syncReceipts} onChange={(event) => setSyncReceipts(event.target.checked)} type="checkbox" />同时同步回款并回填本地「客户实收」</label>
            <label className="flex items-center gap-2 text-sm text-ink-2"><input checked={syncAttachments} onChange={(event) => setSyncAttachments(event.target.checked)} type="checkbox" />下载发票 PDF 到本地附件，并把匹配上的发票挂到对应对账行的「客户开票附件」（明细里可直接查看/下载）</label>
            <label className="flex items-center gap-2 text-sm text-ink-2"><input checked={syncDryRun} onChange={(event) => setSyncDryRun(event.target.checked)} type="checkbox" />仅预演（只统计，不写库、不回填）</label>
            <p className="rounded border border-line-soft bg-canvas px-3 py-2 text-xs text-ink-3">
              回填规则：本地「客户开票 / 客户实收」为空才写入，已有值不一致只在列表里标「与本地不一致」并给出说明；CRM 状态为「已作废」的发票不参与回填。
              CRM 未提供具体到账日，回款日期按到账月份首日预估。发票 PDF 只挂到"有匹配对账行"的发票上，已手工删掉的不会被反复塞回。
            </p>
          </div>
        </Modal>
      ) : null}

      {mappingOpen ? (
        <Modal
          description="CRM 的发票客户与本地对账客户不是同一套名称，维护一次后每次同步自动套用（主体名称优先、简称兜底）。"
          footer={<Button onClick={() => setMappingOpen(false)}>关闭</Button>}
          onClose={() => setMappingOpen(false)}
          title="CRM 客户映射维护"
          widthClass="max-w-4xl"
        >
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-canvas">
                <tr>
                  {["CRM 客户", "主体名称", "发票数", "映射到本地客户", "状态", "操作"].map((label) => (
                    <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-left font-medium" key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {identities.map((identity) => {
                  const key = identity.subjectKey || identity.shortKey;
                  const value = mappingDraft[key] ?? identity.customerId ?? "";
                  return (
                    <tr key={key}>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{identity.shortName || "-"}</td>
                      <td className="border-b border-r border-line-soft px-3 py-2 text-xs text-ink-3">{identity.subjectName || "-"}</td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">{identity.invoiceCount}</td>
                      <td className="border-b border-r border-line-soft px-3 py-2">
                        <Select className="w-full" value={value} onChange={(event) => setMappingDraft((current) => ({ ...current, [key]: event.target.value }))}>
                          <option value="">（未选择）</option>
                          {customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>{customer.code ? `${customer.code} - ` : ""}{customer.shortName || customer.name}</option>
                          ))}
                        </Select>
                      </td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">
                        {identity.customerId
                          ? tag(identity.source === "auto" ? "自动匹配" : "已配置", "bg-success-soft text-success")
                          : tag("未配置", "bg-danger-soft text-danger")}
                      </td>
                      <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">
                        <div className="flex gap-2">
                          <Button disabled={!value || value === identity.customerId} onClick={() => void saveMapping(identity)}>保存</Button>
                          {identity.customerId ? <Button onClick={() => void clearMapping(identity)}>清除</Button> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!identities.length ? <tr><td className="py-10 text-center text-ink-3" colSpan={6}>还没有同步过发票，先去同步一次再维护映射</td></tr> : null}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-3"><Link2 className="mr-1 inline" size={13} />映射保存后只在下次同步生效；已回填的数据不会因为改映射而回滚，需要重刷时把本地发票字段清空再同步。</p>
        </Modal>
      ) : null}

      {allocationTarget ? (
        <CrmInvoiceAllocationModal
          crmInvoiceId={allocationTarget.crmInvoiceId}
          onClose={() => setAllocationTarget(null)}
          onSaved={() => { void load(); void loadMeta(); }}
        />
      ) : null}
    </Panel>
  );
}
