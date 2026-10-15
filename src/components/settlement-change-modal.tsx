"use client";

import { useState } from "react";
import { Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { Button, Input, Select } from "./ui";
import { NumberInput } from "./number-input";
import { Modal } from "./modal";
import { formatMoneyValue } from "@/lib/display-format";
import { notify } from "./app-dialog";

/**
 * 客户变更登记弹层。
 *
 * 报价单确认后是锁定的，客户之后加/减设备都在这里登记：
 *   - 追加设备 → 「新增明细行」，进未采购商品，走和报价设备一样的采购流程；
 *   - 减少设备 → 「标记客户取消」，这一行不再计入结算收入/预计成本，
 *     已经采购花掉的钱仍留在实际成本里（这正是要看见的亏损）；
 *   - 取消错了可以「撤销取消」。
 */

export type SettlementChangeItem = {
  id: string;
  source: string;
  productName: string;
  productCode: string;
  brand: string | null;
  plannedQty: number;
  purchaseQty: number;
  currency: string;
  quotedSalesRevenueUsd: number;
  quotedWarehouseCostUsd: number;
  purchasedCostUsd: number;
  ordered: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
  changeNote: string | null;
};

export type SettlementChangeSummary = {
  quoteRevenueUsd: number;
  quoteCostUsd: number;
  changeRevenueUsd: number;
  changeCostUsd: number;
  settledRevenueUsd: number;
  settledCostUsd: number;
  changeItemCount: number;
  cancelledItemCount: number;
  cancelledRevenueUsd: number;
  cancelledCostUsd: number;
};

const blankDraft = { productName: "", plannedQty: "1", currency: "USD", quotedSalesRevenueUsd: "", quotedWarehouseCostUsd: "", changeNote: "" };

function money(value: number) {
  return formatMoneyValue(Number(value) || 0);
}

export function SettlementChangeModal({ open, projectId, items, summary, readOnly, onClose, onChanged }: {
  open: boolean;
  projectId: string;
  items: SettlementChangeItem[];
  summary: SettlementChangeSummary;
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ ...blankDraft });
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState({ ...blankDraft });

  if (!open) return null;

  const base = `/api/po/settlement-projects/${encodeURIComponent(projectId)}/items`;

  async function run(url: string, method: string, body?: unknown) {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "操作失败");
      await onChanged();
      return true;
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "操作失败";
      setError(message);
      notify(message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addItem() {
    if (!draft.productName.trim()) { setError("请填写设备/服务名称"); return; }
    if (await run(`${base}/change`, "POST", draft)) { setDraft({ ...blankDraft }); setAdding(false); }
  }

  async function saveEdit(itemId: string) {
    if (await run(`${base}/change/${encodeURIComponent(itemId)}`, "PUT", editDraft)) setEditingId("");
  }

  /** 变更行 / 取消行排在前面，方便对账。 */
  const ordered = [...items].sort((left, right) => {
    const weight = (item: SettlementChangeItem) => (item.cancelledAt ? 0 : item.source === "customer_change" ? 1 : 2);
    return weight(left) - weight(right);
  });
  const hasChange = summary.changeItemCount > 0 || summary.cancelledItemCount > 0;

  return (
    <Modal
      title="客户变更登记"
      description="报价单确认后不能改；客户加设备在下面「新增明细行」，减少设备用「标记客户取消」"
      widthClass="max-w-6xl"
      onClose={onClose}
      footer={<>
        <span className="mr-auto text-xs text-ink-3">
          变更合计：收入 {summary.changeRevenueUsd >= 0 ? "+" : ""}{money(summary.changeRevenueUsd)} ／
          成本 {summary.changeCostUsd >= 0 ? "+" : ""}{money(summary.changeCostUsd)}
          ｜ 结算收入 {money(summary.settledRevenueUsd)}
        </span>
        <Button onClick={onClose}>关闭</Button>
      </>}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="border border-line-soft bg-surface-2 p-3"><span className="block text-xs text-ink-3">报价原值（收入／成本）</span><strong className="mt-1 block text-sm">{money(summary.quoteRevenueUsd)} ／ {money(summary.quoteCostUsd)}</strong></div>
          <div className="border border-line-soft bg-surface-2 p-3"><span className="block text-xs text-ink-3">客户变更（净额）</span><strong className="mt-1 block text-sm">{summary.changeRevenueUsd >= 0 ? "+" : ""}{money(summary.changeRevenueUsd)} ／ {summary.changeCostUsd >= 0 ? "+" : ""}{money(summary.changeCostUsd)}</strong></div>
          <div className="border border-line-soft bg-surface-2 p-3"><span className="block text-xs text-ink-3">结算合计（收入／成本）</span><strong className="mt-1 block text-sm">{money(summary.settledRevenueUsd)} ／ {money(summary.settledCostUsd)}</strong></div>
          <div className="border border-line-soft bg-surface-2 p-3"><span className="block text-xs text-ink-3">变更明细</span><strong className="mt-1 block text-sm">追加 {summary.changeItemCount} 行 ／ 取消 {summary.cancelledItemCount} 行</strong></div>
        </div>

        {error ? <div className="border border-tag-red-border bg-tag-red px-3 py-2 text-sm text-tag-red-fg">{error}</div> : null}

        {!readOnly ? (adding ? (
          <div className="rounded border border-primary/40 bg-surface-2 p-3">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <label className="text-xs text-ink-2">设备/服务名称<Input className="mt-1 w-full" value={draft.productName} onChange={(event) => setDraft((current) => ({ ...current, productName: event.target.value }))} /></label>
              <label className="text-xs text-ink-2">数量<NumberInput className="mt-1 w-full" value={draft.plannedQty} onChange={(value) => setDraft((current) => ({ ...current, plannedQty: value }))} /></label>
              <label className="text-xs text-ink-2">币种<Select className="mt-1 w-full" value={draft.currency} onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value }))}><option>USD</option><option>CNY</option><option>MXN</option></Select></label>
              <label className="text-xs text-ink-2">预计收入（未税 USD）<NumberInput className="mt-1 w-full" value={draft.quotedSalesRevenueUsd} onChange={(value) => setDraft((current) => ({ ...current, quotedSalesRevenueUsd: value }))} /></label>
              <label className="text-xs text-ink-2">预计成本（未税 USD）<NumberInput className="mt-1 w-full" value={draft.quotedWarehouseCostUsd} onChange={(value) => setDraft((current) => ({ ...current, quotedWarehouseCostUsd: value }))} /></label>
              <label className="text-xs text-ink-2">客户变更依据<Input className="mt-1 w-full" placeholder="例如：客户 10-08 邮件增加" value={draft.changeNote} onChange={(event) => setDraft((current) => ({ ...current, changeNote: event.target.value }))} /></label>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button onClick={() => { setAdding(false); setDraft({ ...blankDraft }); }}><X size={14} />取消</Button>
              <Button disabled={busy} tone="primary" onClick={() => void addItem()}><Save size={14} />保存明细行</Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end"><Button tone="primary" disabled={busy} onClick={() => setAdding(true)}><Plus size={15} />新增明细行（客户变更）</Button></div>
        )) : null}

        <div className="max-h-[52vh] overflow-auto rounded border border-line-soft">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead className="bg-canvas">
              <tr>
                <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-left font-medium">来源</th>
                <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-left font-medium">设备 / 服务</th>
                <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right font-medium">数量</th>
                <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right font-medium">预计收入（USD）</th>
                <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right font-medium">预计成本（USD）</th>
                <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right font-medium">实际成本（USD）</th>
                <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-left font-medium">状态</th>
                <th className="whitespace-nowrap border-b border-line-soft px-3 py-2 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((item) => {
                const isChange = item.source === "customer_change";
                const cancelled = Boolean(item.cancelledAt);
                const editing = editingId === item.id;
                return (
                  <tr className={cancelled ? "bg-tag-red/40 text-ink-3" : isChange ? "bg-warning-soft/40" : "hover:bg-surface-2"} key={item.id}>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${isChange ? "bg-tag-amber text-tag-amber-fg" : "bg-tag-blue text-tag-blue-fg"}`}>{isChange ? "客户变更" : "报价"}</span>
                    </td>
                    <td className="border-b border-r border-line-soft px-3 py-2">
                      {editing ? <Input className="min-w-[220px]" value={editDraft.productName} onChange={(event) => setEditDraft((current) => ({ ...current, productName: event.target.value }))} /> : <span className="block max-w-[320px] truncate" title={item.productName}>{item.productName}</span>}
                      {item.changeNote && !editing ? <span className="block text-xs text-ink-3">{item.changeNote}</span> : null}
                      {cancelled && item.cancelReason ? <span className="block text-xs text-danger">{item.cancelReason}</span> : null}
                    </td>
                    <td className="numeric-cell border-b border-r border-line-soft px-3 py-2">
                      {editing ? <NumberInput className="w-20" value={editDraft.plannedQty} onChange={(value) => setEditDraft((current) => ({ ...current, plannedQty: value }))} /> : item.plannedQty}
                    </td>
                    <td className="numeric-cell border-b border-r border-line-soft px-3 py-2">
                      {editing ? <NumberInput className="w-28" value={editDraft.quotedSalesRevenueUsd} onChange={(value) => setEditDraft((current) => ({ ...current, quotedSalesRevenueUsd: value }))} /> : (cancelled ? <span className="text-ink-3">0（不计结算）</span> : money(item.quotedSalesRevenueUsd))}
                    </td>
                    <td className="numeric-cell border-b border-r border-line-soft px-3 py-2">
                      {editing ? <NumberInput className="w-28" value={editDraft.quotedWarehouseCostUsd} onChange={(value) => setEditDraft((current) => ({ ...current, quotedWarehouseCostUsd: value }))} /> : (cancelled ? <span className="text-ink-3">0（不计结算）</span> : money(item.quotedWarehouseCostUsd))}
                    </td>
                    <td className="numeric-cell border-b border-r border-line-soft px-3 py-2">{money(item.purchasedCostUsd)}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">
                      {cancelled
                        ? <span className="rounded bg-tag-red px-2 py-0.5 text-xs text-tag-red-fg">客户取消{item.ordered ? " · 已采购" : ""}</span>
                        : item.ordered ? <span className="rounded bg-tag-green px-2 py-0.5 text-xs text-tag-green-fg">已采购</span> : <span className="rounded bg-canvas px-2 py-0.5 text-xs text-ink-3">未采购</span>}
                    </td>
                    <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">
                      {readOnly ? <span className="text-xs text-ink-3">项目已完结</span> : <>
                        {editing ? <>
                          <Button disabled={busy} onClick={() => void saveEdit(item.id)}><Save size={13} />保存</Button>
                          <Button className="ml-2" onClick={() => setEditingId("")}><X size={13} />取消</Button>
                        </> : <>
                          {cancelled ? <Button disabled={busy} onClick={() => void run(`${base}/restore/${encodeURIComponent(item.id)}`, "POST")}><RotateCcw size={13} />撤销取消</Button> : null}
                          {!cancelled && isChange && !item.ordered ? <>
                            <Button disabled={busy} onClick={() => { setEditingId(item.id); setEditDraft({ productName: item.productName, plannedQty: String(item.plannedQty), currency: item.currency, quotedSalesRevenueUsd: String(item.quotedSalesRevenueUsd), quotedWarehouseCostUsd: String(item.quotedWarehouseCostUsd), changeNote: item.changeNote ?? "" }); }}><Pencil size={13} />编辑</Button>
                            <Button className="ml-2" tone="danger" disabled={busy} onClick={() => void run(`${base}/change/${encodeURIComponent(item.id)}`, "DELETE")}><Trash2 size={13} />移除</Button>
                          </> : null}
                          {!cancelled ? <Button className="ml-2" tone="danger" disabled={busy} onClick={() => void run(`${base}/cancel/${encodeURIComponent(item.id)}`, "POST", { reason: "客户取消" })}>标记客户取消</Button> : null}
                        </>}
                      </>}
                    </td>
                  </tr>
                );
              })}
              {!ordered.length ? <tr><td className="px-3 py-8 text-center text-ink-3" colSpan={8}>暂无明细</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
