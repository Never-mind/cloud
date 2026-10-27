"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { InvoicePartyMatch, InvoiceRecognition } from "@/lib/invoice-recognition-service";

const LABELS: Record<string, string> = {
  invoiceNo: "发票号码", invoiceDate: "开票日期", currency: "币种", exchangeRate: "汇率",
  amountExcludingTax: "未税金额", taxRate: "税率（%）", taxAmount: "税金", amountIncludingTax: "含税金额", taxUuid: "税务 UUID",
};

function matchText(match: InvoicePartyMatch) {
  if (match.status === "matched") return `${match.name}（按${match.via}匹配）`;
  if (match.status === "ambiguous") return `${match.candidates.length} 条候选档案，待手工选择`;
  if (match.status === "tax_conflict") return "名称匹配但税号不一致，待核对";
  return "未匹配，待手工选择或补充档案";
}

export function InvoiceRecognitionReview({ recognition, file, values, direction }: {
  recognition: InvoiceRecognition | null; file?: File | null; values: Record<string, unknown>;
  direction?: "income" | "cost" | "";
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) { setUrl(""); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  if (!recognition && !file) return null;
  const original = recognition?.facts ?? (recognition ? { ...recognition.form, amountIncludingTax: recognition.form.invoiceTotal } : null);
  const type = direction ?? recognition?.form.type;
  const matches = recognition?.partyMatches;
  return <div className="space-y-2 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-ink-2">{recognition ? `${recognition.source} · ${recognition.kind}` : file?.name}</span>
      {url ? <a className="inline-flex items-center gap-1 text-primary" href={url} target="_blank" rel="noreferrer"><ExternalLink size={14} />查看原件</a> : null}
    </div>
    {original ? <details className="border-b border-line-soft pb-2" open>
      <summary className="cursor-pointer text-ink-2">票面与确认值</summary>
      <div className="mt-2 max-h-56 overflow-auto">
        <table className="w-full text-left text-xs"><thead><tr>{["字段", "票面值", "当前确认值", "状态"].map(label => <th className="px-2 py-1 font-medium" key={label}>{label}</th>)}</tr></thead>
          <tbody>{Object.entries(LABELS).filter(([key]) => key in values).map(([key, label]) => {
            const raw = String((original as Record<string, unknown>)[key] ?? "");
            const current = String(values[key] ?? "");
            const same = raw === current || (raw !== "" && current !== "" && Number.isFinite(Number(raw)) && Number(raw) === Number(current));
            const status = !current ? "待补充" : same ? "已识别" : raw ? "人工修改" : "补充 / 推算";
            return <tr className="border-t border-line-soft" key={key}><td className="px-2 py-1">{label}</td><td className="max-w-48 break-all px-2 py-1">{raw || "-"}</td><td className="max-w-48 break-all px-2 py-1">{current || "-"}</td><td className="whitespace-nowrap px-2 py-1 text-ink-3">{status}</td></tr>;
          })}</tbody></table>
      </div>
    </details> : null}
    {recognition?.facts ? <div className="grid gap-1 text-xs text-ink-2 sm:grid-cols-2">
      <p className="break-words">销方：{recognition.facts.issuerName || "未识别"} · {recognition.facts.issuerTaxNumber || "税号未识别"}</p>
      <p className="break-words">购方：{recognition.facts.receiverName || "未识别"} · {recognition.facts.receiverTaxNumber || "税号未识别"}</p>
    </div> : null}
    {matches && type ? <div className="grid gap-1 text-xs text-ink-2 sm:grid-cols-2">
      <p className="break-words">销方档案：{matchText(type === "income" ? matches.issuerUnit : matches.issuerSupplier)}</p>
      <p className="break-words">购方档案：{matchText(type === "income" ? matches.receiverCustomer : matches.receiverUnit)}</p>
    </div> : null}
    {recognition?.warnings.length ? <ul className="space-y-1 bg-warning-soft p-2 text-xs text-warning-ink">{recognition.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : null}
  </div>;
}
