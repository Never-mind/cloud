"use client";
import { useEffect, useRef, useState } from "react";
import { Paperclip, Upload, X } from "lucide-react";
import { Button, IconButton, Input } from "./ui";
import { INVOICE_ATTACHMENT_LIMITS as LIMITS, invoiceAttachmentKey as key, type InvoiceAttachmentOption, type InvoiceAttachmentSelection, type InvoiceAttachmentUpload } from "@/lib/invoice-approval-attachments";

export function InvoiceApprovalAttachments({ options, value, onChange, disabled = false, requireCsf = false, onBusyChange }: {
  options: InvoiceAttachmentOption[]; value: InvoiceAttachmentSelection;
  onChange: (value: InvoiceAttachmentSelection) => void; disabled?: boolean; requireCsf?: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const [choosing, setChoosing] = useState(false), [keyword, setKeyword] = useState(""), [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null), mounted = useRef(true), readLock = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refs = value.attachmentRefs ?? [], uploads = value.attachments ?? [];
  const locked = disabled || reading;
  const groups = new Map<string, InvoiceAttachmentOption[]>();
  for (const option of options.filter(file => `${file.fileName} ${file.sourceLabel}`.toLowerCase().includes(keyword.trim().toLowerCase()))) {
    groups.set(option.sourceLabel, [...(groups.get(option.sourceLabel) ?? []), option]);
  }
  function confirm() {
    if (selected.size + uploads.length > LIMITS.count) { setError("审批材料最多 10 个附件"); return; }
    onChange({ ...value, attachmentRefs: options.filter(file => selected.has(key(file))).map(file => ({ source: file.source, attachmentId: file.attachmentId, isCsf: refs.find(ref => key(ref) === key(file))?.isCsf === true })) });
    setChoosing(false); onBusyChange(false); setError("");
  }
  async function addFiles(files: File[]) {
    if (readLock.current || disabled || !files.length) return;
    readLock.current = true; setReading(true); onBusyChange(true); setError("");
    try {
      if (refs.length + uploads.length + files.length > LIMITS.count) throw new Error("审批材料最多 10 个附件");
      if (files.some(file => !file.size || file.size > LIMITS.fileBytes)) throw new Error("附件不能为空，单个文件不能超过 10 MB");
      const previousSize = uploads.reduce((sum, file) => sum + Math.floor((file.dataUrl.split(",")[1]?.length ?? 0) * 3 / 4), 0);
      const storedSize = refs.reduce((sum, ref) => sum + (options.find(file => key(file) === key(ref))?.fileSize ?? 0), 0);
      if (previousSize + storedSize + files.reduce((sum, file) => sum + file.size, 0) > LIMITS.totalBytes) throw new Error("审批附件总大小不能超过 30 MB");
      const added: InvoiceAttachmentUpload[] = [];
      for (const file of files) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("附件读取失败"));
          reader.onerror = () => reject(new Error(`附件读取失败：${file.name}`));
          reader.onabort = () => reject(new Error("附件读取已取消"));
          reader.readAsDataURL(file);
        });
        added.push({ fileName: file.name, dataUrl });
      }
      if (mounted.current) onChange({ ...value, attachments: [...uploads, ...added] });
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "附件读取失败"); }
    finally { readLock.current = false; if (mounted.current) { setReading(false); onBusyChange(false); } }
  }
  return <section className="min-w-0 border-t border-line-soft pt-4" aria-label="审批材料">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h3 className="mr-auto text-sm font-medium">审批材料{requireCsf ? "（含客户 CSF）" : ""}</h3>
      <Button type="button" disabled={locked} onClick={() => { setSelected(new Set(refs.map(key))); setKeyword(""); setError(""); setChoosing(true); onBusyChange(true); }}><Paperclip size={14} />从单据选择</Button>
      <Button type="button" disabled={locked || choosing} onClick={() => fileInput.current?.click()}><Upload size={14} />选择文件</Button>
      <input ref={fileInput} aria-label="上传审批材料" type="file" multiple hidden disabled={locked || choosing} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void addFiles(files); }} />
    </div>
    {requireCsf ? <p className="mb-2 text-xs text-ink-3">客户 CSF 必填；请在对应文件旁勾选“客户 CSF”。</p> : null}
    {choosing ? <div role="group" aria-label="从单据选择附件" className="mb-3 border border-line-soft p-3">
      <Input aria-label="搜索附件" placeholder="搜索文件名或来源" value={keyword} disabled={locked} onChange={event => setKeyword(event.target.value)} />
      <div className="my-3 max-h-64 space-y-3 overflow-auto">
        {[...groups].map(([label, files]) => <section key={label}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs"><span>{label}</span><label className="flex items-center gap-1"><input type="checkbox" aria-label={`${label}全选`} disabled={locked} checked={files.every(file => selected.has(key(file)))} onChange={event => { const next = new Set(selected); files.forEach(file => event.target.checked ? next.add(key(file)) : next.delete(key(file))); setSelected(next); }} />全选本组</label></div>
          {files.map(file => <label key={key(file)} className="flex min-w-0 items-start gap-2 py-1.5 text-sm"><input className="mt-1 shrink-0" type="checkbox" disabled={locked} checked={selected.has(key(file))} onChange={event => { const next = new Set(selected); if (event.target.checked) next.add(key(file)); else next.delete(key(file)); setSelected(next); }} /><span className="min-w-0 break-all">{file.fileName}</span></label>)}
        </section>)}
        {!groups.size ? <p className="py-4 text-center text-sm text-ink-3">{options.length ? "没有匹配的附件" : "当前单据暂无已有附件"}</p> : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2"><span className="mr-auto text-xs text-ink-3">已选 {selected.size} 个</span><Button type="button" disabled={locked} onClick={() => { setChoosing(false); onBusyChange(false); setError(""); }}>取消</Button><Button type="button" tone="primary" disabled={locked} onClick={confirm}>确定选择</Button></div>
    </div> : null}
    <ul className="space-y-2">
      {refs.map(ref => { const file = options.find(file => key(file) === key(ref)); return <li key={key(ref)} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <span className="min-w-0 flex-1 break-all">{file?.fileName ?? "附件已失效，请移除后重新选择"}<span className="ml-2 text-xs text-ink-3">{file?.sourceLabel}</span></span>
        {requireCsf ? <label className="flex items-center gap-1 whitespace-nowrap text-xs"><input aria-label={`${file?.fileName ?? ref.attachmentId} 客户 CSF`} type="checkbox" disabled={locked} checked={ref.isCsf === true} onChange={event => onChange({ ...value, attachmentRefs: refs.map(item => key(item) === key(ref) ? { ...item, isCsf: event.target.checked } : item) })} />客户 CSF</label> : null}
        <IconButton icon={<X size={14} />} label={`移除 ${file?.fileName ?? ref.attachmentId}`} disabled={locked} onClick={() => onChange({ ...value, attachmentRefs: refs.filter(item => key(item) !== key(ref)) })} />
      </li>; })}
      {uploads.map((file, index) => <li key={index} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <span className="min-w-0 flex-1 break-all">{file.fileName}<span className="ml-2 text-xs text-ink-3">本次上传</span></span>
        {requireCsf ? <label className="flex items-center gap-1 whitespace-nowrap text-xs"><input aria-label={`${file.fileName} 客户 CSF`} type="checkbox" disabled={locked} checked={file.isCsf === true} onChange={event => onChange({ ...value, attachments: uploads.map((item, i) => i === index ? { ...item, isCsf: event.target.checked } : item) })} />客户 CSF</label> : null}
        <IconButton icon={<X size={14} />} label={`移除 ${file.fileName}`} disabled={locked} onClick={() => onChange({ ...value, attachments: uploads.filter((_, i) => i !== index) })} />
      </li>)}
    </ul>
    {!refs.length && !uploads.length ? <p className="text-sm text-ink-3">暂无审批材料</p> : null}
    <p className="mt-2 text-xs text-ink-3">最多 10 个，单个不超过 10 MB，总计不超过 30 MB{reading ? " · 正在读取文件…" : ""}</p>
    {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
  </section>;
}
