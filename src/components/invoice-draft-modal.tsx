"use client";

import { useCallback, useEffect, useState } from "react";
import { FileUp } from "lucide-react";
import { Button, Input, Select, Textarea } from "./ui";
import { Modal } from "./modal";
import { notify } from "./app-dialog";
import { SearchSelect, type SearchSelectOption } from "./search-select";

/**
 * 开票弹层（两种模式共用）：
 *   - mode="generated"：系统生成票面，票号按账期自动分配；
 *   - mode="external" ：外部已开票，上传文件 + 登记票号金额。
 * 账单页（华为云对账、月账单对账单）和发票台账页都复用这一个组件，
 * 区别只在 sourceType / sourceId —— 传了来源就调 /api/invoices/prefill 预填。
 */

export type InvoiceDraftMode = "generated" | "external";
export type InvoiceDraftSourceType = "manual" | "cloud_row" | "billing_statement" | "service_fee" | "settlement_invoice";

type DraftLine = { periodLabel: string; description: string; amount: string };

type DraftForm = {
  sourceType: InvoiceDraftSourceType;
  sourceId: string;
  sourceNo: string;
  period: string;
  invoiceNo: string;
  customerId: string;
  undertakingUnitId: string;
  template: "normal" | "sgd";
  invoiceDate: string;
  dueDate: string;
  paymentTermDays: string;
  currency: string;
  amountExcludingTax: string;
  taxRate: string;
  taxAmount: string;
  amountIncludingTax: string;
  sgdRate: string;
  sgdTotal: string;
  gstRegNo: string;
  comment: string;
  lines: DraftLine[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addDays(dateString: string, days: number) {
  const base = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(base.getTime())) return dateString;
  return new Date(base.getTime() + days * 86400000).toISOString().slice(0, 10);
}

export function emptyInvoiceDraft(sourceType: InvoiceDraftSourceType = "manual", sourceId = ""): DraftForm {
  const invoiceDate = todayIso();
  return {
    sourceType, sourceId, sourceNo: "", period: invoiceDate.slice(0, 7).replace("-", ""),
    invoiceNo: "", customerId: "", undertakingUnitId: "", template: "normal",
    invoiceDate, dueDate: addDays(invoiceDate, 30), paymentTermDays: "30", currency: "USD",
    amountExcludingTax: "", taxRate: "", taxAmount: "", amountIncludingTax: "",
    sgdRate: "", sgdTotal: "", gstRegNo: "", comment: "",
    lines: [{ periodLabel: "", description: "", amount: "" }],
  };
}

/** 伙伴下拉：客户与承接单位都用同一套搜索选择。 */
function usePartnerOptions(entity: string) {
  const [options, setOptions] = useState<SearchSelectOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/entities/${entity}?page=1&pageSize=200`, { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;
        const rows = (data.rows ?? data.items ?? []) as Record<string, unknown>[];
        setOptions(rows.map((row) => ({
          value: text(row.customerId ?? row.undertakingUnitId ?? row.id),
          label: text(row.shortName ?? row.nameCn ?? row.nameEn ?? row.name),
          code: text(row.customerCode ?? row.undertakingUnitCode),
          hint: text(row.nameEn ?? row.entityName ?? ""),
        })));
      } catch {
        if (!cancelled) setOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [entity]);
  return options;
}

export function InvoiceDraftModal({
  mode,
  onClose,
  onSaved,
  open,
  sourceId = "",
  sourceType = "manual",
}: {
  mode: InvoiceDraftMode;
  onClose: () => void;
  onSaved?: (invoice: Record<string, unknown>) => void;
  open: boolean;
  sourceId?: string;
  sourceType?: InvoiceDraftSourceType;
}) {
  const [draft, setDraft] = useState<DraftForm | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const customerOptions = usePartnerOptions("customers");
  const unitOptions = usePartnerOptions("undertaking-units");

  // 打开时按来源预填；来源为空就是纯手填
  useEffect(() => {
    if (!open) return;
    const base = emptyInvoiceDraft(sourceType, sourceId);
    if (!sourceId) { setDraft(base); setFile(null); return; }
    let cancelled = false;
    setPrefilling(true);
    void (async () => {
      try {
        const response = await fetch(`/api/invoices/prefill?sourceType=${sourceType}&sourceId=${encodeURIComponent(sourceId)}`, { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error ?? "预填失败");
        setDraft({
          ...base,
          sourceNo: text(data.sourceNo),
          period: text(data.period) || base.period,
          invoiceNo: text(data.suggestedInvoiceNo),
          customerId: text(data.customerId),
          undertakingUnitId: text(data.undertakingUnitId),
          invoiceDate: text(data.invoiceDate) || base.invoiceDate,
          dueDate: text(data.dueDate) || base.dueDate,
          paymentTermDays: text(data.paymentTermDays) || "30",
          currency: text(data.currency) || "USD",
          amountExcludingTax: text(data.amountExcludingTax),
          taxRate: text(data.taxRate),
          taxAmount: text(data.taxAmount),
          amountIncludingTax: text(data.amountIncludingTax),
          lines: ((data.lines ?? []) as Record<string, unknown>[]).map((line) => ({
            periodLabel: text(line.date), description: text(line.desc), amount: text(line.cost),
          })),
        });
        const missing = (data.missing ?? []) as string[];
        if (missing.length) notify(`开票资料待补齐：${missing.join("、")}`, "info");
      } catch (error) {
        if (!cancelled) {
          notify(error instanceof Error ? error.message : "预填失败", "error");
          setDraft(base);
        }
      } finally {
        if (!cancelled) setPrefilling(false);
      }
    })();
    setFile(null);
    return () => { cancelled = true; };
  }, [open, sourceId, sourceType]);

  const submit = useCallback(async () => {
    if (!draft) return;
    if (mode === "external" && !file) { notify("请先选择发票文件", "error"); return; }
    setBusy(true);
    try {
      let response: Response;
      if (mode === "external") {
        const form = new FormData();
        form.set("file", file as File);
        form.set("payload", JSON.stringify({ ...draft, source: "external" }));
        response = await fetch("/api/invoices", { method: "POST", body: form });
      } else {
        response = await fetch("/api/invoices", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...draft, source: "generated" }),
        });
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? (mode === "external" ? "登记失败" : "开票失败"));
      notify(`${mode === "external" ? "已登记外部发票" : "已开票"}：${text(data.invoice?.invoiceNo)}`, "success");
      onSaved?.(data.invoice as Record<string, unknown>);
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setBusy(false);
    }
  }, [draft, file, mode, onClose, onSaved]);

  if (!open) return null;

  return (
    <Modal
      description={mode === "external"
        ? "外部已经开好票：只登记 + 存文件，不生成票面"
        : "票面按开票主体与客户档案生成；资料缺项会拦下并提示去补档案"}
      footer={<>
        <Button onClick={onClose}>取消</Button>
        <Button disabled={busy || prefilling || !draft} onClick={() => void submit()} tone="primary">
          {busy ? "保存中…" : mode === "external" ? "保存并标记已开票" : "生成并标记已开票"}
        </Button>
      </>}
      onClose={onClose}
      title={mode === "external" ? "上传外部发票" : "开票"}
      widthClass="max-w-5xl"
    >
      {!draft || prefilling ? (
        <div className="py-10 text-center text-sm text-ink-3">正在按账单预填…</div>
      ) : (
        <div className="space-y-5">
          {mode === "external" ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-ink">发票文件</h3>
              <label className="flex cursor-pointer items-center gap-2 rounded border border-dashed border-line px-4 py-4 text-sm text-ink-2 hover:border-primary hover:text-primary">
                <FileUp size={16} />
                <span>{file ? `${file.name}（${Math.max(1, Math.round(file.size / 1024))} KB）` : "点击选择 PDF / 图片，单个最大 25 MB"}</span>
                <input className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" />
              </label>
              <p className="text-xs text-ink-3">存盘时文件名自动加 <code>Inv_</code> 前缀，便于和票面文件区分。</p>
            </section>
          ) : null}
          <DraftFormFields
            customerOptions={customerOptions}
            draft={draft}
            onChange={setDraft}
            simple={mode === "external"}
            unitOptions={unitOptions}
          />
        </div>
      )}
    </Modal>
  );
}

function DraftFormFields({
  draft,
  customerOptions,
  unitOptions,
  onChange,
  simple = false,
}: {
  draft: DraftForm;
  customerOptions: SearchSelectOption[];
  unitOptions: SearchSelectOption[];
  onChange: (next: DraftForm) => void;
  simple?: boolean;
}) {
  const patch = (values: Partial<DraftForm>) => onChange({ ...draft, ...values });
  const labelClass = "flex min-w-0 flex-col gap-1 text-sm";
  const sectionClass = "space-y-3 border-t border-line-soft pt-4 first:border-t-0 first:pt-0";
  const headingClass = "text-sm font-medium text-ink";
  const hintClass = "text-xs text-ink-3";

  const updateLine = (index: number, values: Partial<DraftLine>) =>
    patch({ lines: draft.lines.map((line, i) => (i === index ? { ...line, ...values } : line)) });

  /** 双币模板：改汇率或含税金额时把 SGD 合计按 汇率 × 含税 重算，用户仍可手工覆盖。 */
  const syncSgdTotal = (next: Partial<DraftForm>) => {
    const merged = { ...draft, ...next };
    if (merged.template !== "sgd") return next;
    const rate = Number(merged.sgdRate);
    const total = Number(merged.amountIncludingTax);
    if (!Number.isFinite(rate) || !Number.isFinite(total) || rate <= 0 || total <= 0) return next;
    return { ...next, sgdTotal: (Math.round(rate * total * 100) / 100).toFixed(2) };
  };

  return (
    <div className="space-y-5">
      <section className={sectionClass}>
        <h3 className={headingClass}>开票双方</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            <span className="text-ink-2">客户抬头</span>
            <SearchSelect
              className="w-full"
              onChange={(value) => patch({ customerId: value })}
              options={customerOptions}
              placeholder="按简称 / 编码搜索客户"
              value={draft.customerId}
            />
            <span className={hintClass}>抬头、发票地址、联系人都取客户档案</span>
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">开票主体（承接单位）</span>
            <SearchSelect
              className="w-full"
              onChange={(value) => patch({ undertakingUnitId: value })}
              options={unitOptions}
              placeholder="按简称 / 编码搜索承接单位"
              value={draft.undertakingUnitId}
            />
            <span className={hintClass}>地址、电话、财务邮箱、签章与收款银行取承接单位档案</span>
          </label>
        </div>
      </section>

      <section className={sectionClass}>
        <h3 className={headingClass}>票号与日期</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelClass}>
            <span className="text-ink-2">发票号</span>
            <Input className="w-full" onChange={(event) => patch({ invoiceNo: event.target.value })} placeholder="留空自动分配" value={draft.invoiceNo} />
            <span className={hintClass}>{simple ? "填外部系统出具的发票号" : "规则 INV-账期-流水，可手工改"}</span>
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">开票日期</span>
            <Input
              className="w-full"
              onChange={(event) => {
                const invoiceDate = event.target.value;
                const days = Number(draft.paymentTermDays) || 30;
                patch({ invoiceDate, dueDate: addDays(invoiceDate, days), period: invoiceDate.slice(0, 7).replace("-", "") });
              }}
              type="date"
              value={draft.invoiceDate}
            />
            <span className={hintClass}>账期按开票日所在月归集</span>
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">账期天数 / 到期日</span>
            <div className="flex min-w-0 items-center gap-2">
              <Input
                className="w-[92px] shrink-0"
                onChange={(event) => {
                  const days = event.target.value;
                  patch({ paymentTermDays: days, dueDate: addDays(draft.invoiceDate, Number(days) || 30) });
                }}
                value={draft.paymentTermDays}
              />
              <Input className="w-full" readOnly value={draft.dueDate} />
            </div>
            <span className={hintClass}>到期日 = 开票日 + 账期天数</span>
          </label>
        </div>
      </section>

      <section className={sectionClass}>
        <h3 className={headingClass}>金额</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>
            <span className="text-ink-2">币种</span>
            <Input className="w-full" onChange={(event) => patch({ currency: event.target.value })} value={draft.currency} />
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">未税金额</span>
            <Input className="w-full" onChange={(event) => patch({ amountExcludingTax: event.target.value })} value={draft.amountExcludingTax} />
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">税率（%）</span>
            <Input className="w-full" onChange={(event) => patch({ taxRate: event.target.value })} placeholder="例如 8 表示 8%" value={draft.taxRate} />
            <span className={hintClass}>填百分数：8% 就填 8（不要填 0.08）</span>
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">税金</span>
            <Input className="w-full" onChange={(event) => patch({ taxAmount: event.target.value })} value={draft.taxAmount} />
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">含税金额</span>
            <Input
              className="w-full"
              onChange={(event) => onChange({ ...draft, ...syncSgdTotal({ amountIncludingTax: event.target.value }) })}
              value={draft.amountIncludingTax}
            />
            <span className={hintClass}>票面 Total，也是明细行合计</span>
          </label>
          {simple ? null : (
            <>
              <label className={labelClass}>
                <span className="text-ink-2">票面模板</span>
                <Select className="w-full" onChange={(event) => patch({ template: event.target.value === "sgd" ? "sgd" : "normal" })} value={draft.template}>
                  <option value="normal">普通 Invoice</option>
                  <option value="sgd">双币 TAX INVOICE（含 SGD 列）</option>
                </Select>
              </label>
              {draft.template === "sgd" ? (
                <>
                  <label className={labelClass}>
                    <span className="text-ink-2">SGD 汇率</span>
                    <Input
                      className="w-full"
                      onChange={(event) => onChange({ ...draft, ...syncSgdTotal({ sgdRate: event.target.value }) })}
                      value={draft.sgdRate}
                    />
                    <span className={hintClass}>行 SGD 金额 = 金额 × 汇率</span>
                  </label>
                  <label className={labelClass}>
                    <span className="text-ink-2">SGD 合计</span>
                    <Input className="w-full" onChange={(event) => patch({ sgdTotal: event.target.value })} value={draft.sgdTotal} />
                  </label>
                </>
              ) : null}
            </>
          )}
        </div>
      </section>

      {simple ? null : (
        <>
          <section className={sectionClass}>
            <div className="flex items-center justify-between">
              <h3 className={headingClass}>明细行</h3>
              <Button onClick={() => patch({ lines: [...draft.lines, { periodLabel: "", description: "", amount: "" }] })} size="sm" type="button">
                添加行
              </Button>
            </div>
            <div className="overflow-hidden rounded border border-line-soft">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-canvas">
                  <tr>
                    {["期间", "描述", "金额", ""].map((label, index) => (
                      <th className="border-b border-line-soft px-3 py-2 text-left font-medium text-ink-2" key={index}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line, index) => (
                    <tr key={index}>
                      <td className="border-b border-line-soft p-2 align-middle">
                        <Input className="w-full" onChange={(event) => updateLine(index, { periodLabel: event.target.value })} value={line.periodLabel} />
                      </td>
                      <td className="border-b border-line-soft p-2 align-middle">
                        <Input className="w-full" onChange={(event) => updateLine(index, { description: event.target.value })} value={line.description} />
                      </td>
                      <td className="border-b border-line-soft p-2 align-middle">
                        <Input className="w-full" onChange={(event) => updateLine(index, { amount: event.target.value })} value={line.amount} />
                      </td>
                      <td className="border-b border-line-soft p-2 align-middle text-right">
                        <button
                          className="rounded px-2 py-1 text-xs text-danger hover:bg-danger-soft disabled:opacity-50"
                          disabled={draft.lines.length <= 1}
                          onClick={() => patch({ lines: draft.lines.filter((_, i) => i !== index) })}
                          type="button"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={hintClass}>票面数量固定为 1，金额同时作为单价与小计；不足 6 行会自动补空行。</p>
          </section>

          <section className={sectionClass}>
            <h3 className={headingClass}>备注</h3>
            <Textarea className="w-full" onChange={(event) => patch({ comment: event.target.value })} rows={3} value={draft.comment} />
            <p className={hintClass}>备注会按票面宽度自动折行，并据此调整票面行高。</p>
          </section>
        </>
      )}
    </div>
  );
}
