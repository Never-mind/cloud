"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Select, Textarea } from "./ui";
import { approvalInvoiceLineTotal, MAX_APPROVAL_INVOICE_LINES, type MexicoInvoiceLine } from "@/lib/invoice-approval-lines";
import { centsText, moneyCents } from "@/lib/invoice-allocation";
import { normalizeInvoiceMoneyInput } from "@/lib/invoice-money-input";

export function InvoiceApprovalLinesEditor({ value, onChange, total, currency, options, periodLines, allocationOptions, mergeDescription, onUseTotal, disabled = false }: {
  value: MexicoInvoiceLine[];
  onChange: (lines: MexicoInvoiceLine[]) => void;
  total: string; currency: string;
  options: Array<{value:string;label:string}>;
  periodLines?: MexicoInvoiceLine[];
  allocationOptions?: Array<{value:string;label:string}>;
  mergeDescription: string;
  onUseTotal: (amount: string) => void;
  disabled?: boolean;
}) {
  let sum: string | null = null, difference: string | null = null;
  try { sum = approvalInvoiceLineTotal(value); difference = centsText(moneyCents(sum) - moneyCents(normalizeInvoiceMoneyInput(total))); } catch { /* Leave incomplete rows editable. */ }
  function edit(index: number, patch: Partial<MexicoInvoiceLine>) {
    onChange(value.map((line, i) => i === index ? { ...line, ...patch } : line));
  }
  function finishAmount(index: number) {
    try { edit(index, { amountIncludingTax: normalizeInvoiceMoneyInput(value[index].amountIncludingTax) }); }
    catch { /* Submit shows the row-specific error. */ }
  }
  return <fieldset disabled={disabled} className="mt-4 space-y-3 border-t border-line-soft pt-4" aria-label="飞书开票明细">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="text-sm font-medium">开票明细 · {value.length} 行</h4><p className="mt-1 text-xs text-ink-3">每行分别传入飞书，可自由拆分服务内容。各账期入账金额以上方分摊为准。</p></div>
      <div className="flex flex-wrap gap-2">
        {periodLines?.length ? <Button type="button" size="sm" onClick={() => onChange(periodLines)}>按账期重新生成</Button> : null}
        <Button type="button" size="sm" onClick={() => onChange([{ amountIncludingTax: total, invoiceContent: mergeDescription || value[0]?.invoiceContent || "", cfdiCodeKey: value[0]?.cfdiCodeKey || options[0]?.value || "" }])}>合并为一行</Button>
        <Button type="button" size="sm" disabled={disabled || value.length >= MAX_APPROVAL_INVOICE_LINES} onClick={() => onChange([...value, { amountIncludingTax: "", invoiceContent: value.at(-1)?.invoiceContent || "", cfdiCodeKey: value.at(-1)?.cfdiCodeKey || options[0]?.value || "" }])}><Plus size={14}/>新增明细</Button>
      </div>
    </div>
    {value.map((line,index) => <div key={index} className="rounded border border-line-soft bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-ink-2">明细 {index+1}</span><Button type="button" size="sm" aria-label={`删除明细 ${index+1}`} disabled={disabled || value.length <= 1} onClick={() => onChange(value.filter((_,i) => i !== index))}><Trash2 size={13}/>删除</Button></div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs text-ink-2">含税金额 Amount · {currency}<Input aria-label={`明细 ${index+1} 含税金额`} inputMode="decimal" placeholder="0.00" value={line.amountIncludingTax} onChange={event => edit(index,{amountIncludingTax:event.target.value})} onBlur={()=>finishAmount(index)}/></label>
        <label className="grid gap-1 text-xs text-ink-2">CFDI Code 用途码<Select aria-label={`明细 ${index+1} CFDI 用途码`} value={line.cfdiCodeKey} onChange={event => edit(index,{cfdiCodeKey:event.target.value})}><option value="">请选择</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></label>
        <label className="grid gap-1 text-xs text-ink-2 md:col-span-2">Invoice Content 开票内容<Textarea aria-label={`明细 ${index+1} 开票内容`} rows={2} maxLength={500} value={line.invoiceContent} onChange={event => edit(index,{invoiceContent:event.target.value})}/></label>
        {allocationOptions?.length?<label className="grid gap-1 text-xs text-ink-2 md:col-span-2">对应账单（按账号区分）<Select aria-label={`明细 ${index+1} 对应账单`} value={line.allocationSourceId || ""} onChange={event=>edit(index,{allocationSourceId:event.target.value || undefined})}><option value="">合并票面行，账期金额在上方填写</option>{allocationOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</Select></label>:null}
      </div>
    </div>)}
    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line-soft px-3 py-2">
      <p role="status" className={`text-sm ${difference === "0.00" ? "text-success" : "text-warning-ink"}`}>明细含税合计：{sum ?? "待填写"} {currency} · 整单含税金额：{total || "待填写"}{difference === "0.00" ? " · 合计一致" : difference ? ` · 差额 ${difference}` : " · 请补齐金额"}</p>
      <Button type="button" size="sm" disabled={disabled || sum === null || Number(sum) <= 0} onClick={() => { if (sum !== null) onUseTotal(sum); }}>使用明细合计</Button>
    </div>
    <p className="text-xs text-ink-3">金额自动保留两位小数。每行均已选择对应账单且覆盖全部账单时，点击“使用明细合计”会按各行金额同步账期分摊，汇率留空则自动反算；以确认的开票金额为准。</p>
  </fieldset>;
}
