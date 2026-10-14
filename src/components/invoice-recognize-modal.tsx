"use client";

import { useRef, useState } from "react";
import { FileUp, ScanLine } from "lucide-react";
import { Button } from "./ui";
import { Modal } from "./modal";
import type { InvoiceRecognition, RecognizedInvoiceForm } from "@/lib/invoice-recognition-service";

const STATUS_LABEL: Record<InvoiceRecognition["fields"][number]["status"], { text: string; className: string }> = {
  matched: { text: "税号匹配档案", className: "bg-tag-green text-tag-green-fg" },
  recognized: { text: "已识别", className: "bg-tag-blue text-tag-blue-fg" },
  derived: { text: "推导", className: "bg-tag-amber text-tag-amber-fg" },
  missing: { text: "未识别", className: "bg-canvas text-ink-3" },
};

/**
 * 上传发票识别：选票 → 后端解析 → 结果逐字段确认 → 填进新增发票表单。
 * 只解析不入库，用户点「新增发票」保存时才真正落库并把原文件挂到发票附件下。
 */
export function InvoiceRecognizeModal({ open, projectId, onClose, onSaved }: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  /** 确认后直接落到下方发票明细（父组件负责调接口），失败时抛错由弹层展示 */
  onSaved: (form: RecognizedInvoiceForm, file: File) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [recognition, setRecognition] = useState<InvoiceRecognition | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function close() {
    setFile(null); setRecognition(null); setError(""); setBusy(false);
    onClose();
  }

  async function recognize(next: File) {
    setFile(next); setRecognition(null); setError(""); setBusy(true);
    try {
      const body = new FormData();
      body.append("file", next);
      const response = await fetch(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/invoices/recognize`, { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "发票识别失败");
      setRecognition(data.recognition as InvoiceRecognition);
    } catch (recognizeError) {
      setError(recognizeError instanceof Error ? recognizeError.message : "发票识别失败");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!file || !recognition) return;
    setBusy(true); setError("");
    try {
      await onSaved(recognition.form, file);
      setFile(null); setRecognition(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "发票保存失败");
    } finally {
      setBusy(false);
    }
  }

  // Modal 组件本身不认 open，弹层由这里控制挂载（否则页面一打开就挡住列表）
  if (!open) return null;

  return (
    <Modal
      title="上传发票识别"
      description="支持中国增值税电子发票 PDF、墨西哥 CFDI 的 XML / PDF；核对识别结果后点确认，直接写进下方发票明细"
      widthClass="max-w-4xl"
      onClose={close}
      footer={<>
        <Button onClick={close}>取消</Button>
        <Button disabled={!recognition || !file || busy} tone="primary" onClick={() => void save()}>{busy ? "正在保存…" : "确认并新增到明细"}</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="rounded border border-dashed border-line bg-surface-2 p-4 text-center">
          <input
            ref={inputRef}
            accept=".pdf,.xml,application/pdf,text/xml,application/xml"
            className="hidden"
            type="file"
            onChange={(event) => { const picked = event.target.files?.[0]; event.target.value = ""; if (picked) void recognize(picked); }}
          />
          <ScanLine className="mx-auto mb-2 text-primary" size={22} />
          <p className="text-sm text-ink-2">选择要识别的发票文件（PDF / XML）</p>
          <p className="mt-1 text-xs text-ink-3">照片、扫描件没有文字层，本期识别不了</p>
          <Button className="mt-3" disabled={busy} onClick={() => inputRef.current?.click()}><FileUp size={15} />{file ? "重新选择" : "选择文件"}</Button>
          {file ? <p className="mt-2 text-xs text-ink-3">已选：{file.name}</p> : null}
        </div>

        {busy ? <p className="text-sm text-ink-2">正在识别…</p> : null}
        {error ? <p className="rounded border border-tag-red-border bg-tag-red px-3 py-2 text-sm text-tag-red-fg">{error}</p> : null}

        {recognition ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">
              识别来源：<span className="font-medium text-ink">{recognition.source}</span>
              {recognition.kind ? <span className="ml-2 text-ink-3">{recognition.kind}</span> : null}
              <span className={`ml-2 rounded px-2 py-0.5 text-xs ${recognition.exact ? "bg-tag-green text-tag-green-fg" : "bg-tag-amber text-tag-amber-fg"}`}>
                {recognition.exact ? "结构化精确解析" : "按模板读取，请重点核对"}
              </span>
            </p>
            <div className="max-h-[46vh] overflow-auto rounded border border-line-soft">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-canvas"><tr><th className="border-b border-r border-line-soft px-3 py-2 text-left font-medium">字段</th><th className="border-b border-r border-line-soft px-3 py-2 text-left font-medium">识别值</th><th className="border-b border-line-soft px-3 py-2 text-left font-medium">状态</th></tr></thead>
                <tbody>
                  {recognition.fields.map((field) => <tr key={field.key}>
                    <td className="border-b border-r border-line-soft px-3 py-2 text-ink-2">{field.label}</td>
                    <td className="border-b border-r border-line-soft px-3 py-2 text-ink">{field.value || "—"}</td>
                    <td className="border-b border-line-soft px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs ${STATUS_LABEL[field.status].className}`}>{STATUS_LABEL[field.status].text}</span></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            {recognition.warnings.length ? <ul className="space-y-1 rounded border border-warning-border-soft bg-warning-soft px-3 py-2 text-xs text-warning-ink">
              {recognition.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
            </ul> : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
