"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileUp, Trash2 } from "lucide-react";
import { Button } from "./ui";
import { Modal } from "./modal";
import { EmptyState, LoadingBlock } from "./table-state";
import { confirmDialog, notify } from "./app-dialog";
import { formatDisplayValue } from "@/lib/display-format";

type AttachmentRow = {
  id: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | string | null;
  description: string | null;
  uploadedByName: string | null;
  uploadedAt: string | null;
  storageProvider: string | null;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function formatSize(value: unknown) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** 月账单对账单附件：票面会自动挂在这里，也可以手工上传外部发票或其它文件。 */
export function BillingStatementAttachments({ onClose, snapshotNo }: { onClose: () => void; snapshotNo: string }) {
  const [items, setItems] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/billing-statements/${encodeURIComponent(snapshotNo)}/attachments`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "附件加载失败");
      setItems((data.items ?? []) as AttachmentRow[]);
    } catch (error) {
      notify(error instanceof Error ? error.message : "附件加载失败", "error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [snapshotNo]);

  useEffect(() => { void load(); }, [load]);

  async function upload(file: File) {
    if (file.size > 25 * 1024 * 1024) { notify("单个附件不能超过 25 MB", "error"); return; }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("文件读取失败"));
        reader.readAsDataURL(file);
      });
      const response = await fetch(`/api/billing-statements/${encodeURIComponent(snapshotNo)}/attachments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size, dataUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "附件上传失败");
      notify("附件已上传", "success");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "附件上传失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: AttachmentRow) {
    if (!(await confirmDialog(`删除附件 ${row.fileName}？`))) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/billing-statements/${encodeURIComponent(snapshotNo)}/attachments/${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "附件删除失败");
      notify("附件已删除", "success");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "附件删除失败", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      description={`${snapshotNo} · 票面会自动挂在这里，外部发票也可以手工上传`}
      footer={<Button onClick={onClose}>关闭</Button>}
      onClose={onClose}
      title="对账单附件"
      widthClass="max-w-3xl"
    >
      <div className="space-y-3">
        <label className="flex cursor-pointer items-center gap-2 rounded border border-dashed border-line px-4 py-3 text-sm text-ink-2 hover:border-primary hover:text-primary">
          <FileUp size={16} />
          <span>{busy ? "处理中…" : "点击选择文件上传（PDF / 图片 / Office，单个最大 25 MB）"}</span>
          <input
            className="hidden"
            disabled={busy}
            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }}
            type="file"
          />
        </label>
        {loading ? <LoadingBlock /> : (
          <table className="w-full border-collapse text-sm">
            <thead className="bg-canvas">
              <tr>{["文件名", "说明", "大小", "存放", "上传人", "上传时间", "操作"].map((label) => (
                <th className="border-b border-r border-line-soft px-3 py-2 text-left font-medium text-ink-2" key={label}>{label}</th>
              ))}</tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td className="max-w-[260px] truncate border-b border-r border-line-soft px-3 py-2" title={row.fileName}>{row.fileName}</td>
                  <td className="border-b border-r border-line-soft px-3 py-2 text-xs text-ink-3">{text(row.description) || "-"}</td>
                  <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{formatSize(row.fileSize)}</td>
                  <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-xs text-ink-3">{row.storageProvider === "obs" ? "云盘" : "数据库"}</td>
                  <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-xs">{text(row.uploadedByName) || "-"}</td>
                  <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-xs text-ink-3">
                    {row.uploadedAt ? formatDisplayValue(row.uploadedAt as never, "datetime") : "-"}
                  </td>
                  <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">
                    <div className="flex items-center gap-2">
                      <a
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        href={`/api/billing-statements/${encodeURIComponent(snapshotNo)}/attachments/${encodeURIComponent(row.id)}/download`}
                      >
                        <Download size={12} />下载
                      </a>
                      <button
                        className="inline-flex items-center gap-1 text-xs text-danger hover:underline disabled:opacity-50"
                        disabled={busy}
                        onClick={() => void remove(row)}
                        type="button"
                      >
                        <Trash2 size={12} />删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length ? (
                <tr><td colSpan={7} className="py-8 text-center"><EmptyState hint="开票后票面会自动挂进来" title="暂无附件" /></td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
