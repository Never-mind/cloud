"use client";

import { useCallback, useEffect, useState } from "react";
import { FileDown, Paperclip, Trash2 } from "lucide-react";
import { confirmDialog, notify } from "./app-dialog";

type CloudAttachment = {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
};

function formatSize(bytes: number) {
  const size = Number(bytes ?? 0);
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

/**
 * 华为云附件的"查看/下载/删除"入口。
 *
 * 上传入口散在客户开票与供应商付款两处，之前只能传、看不见也删不掉；
 * 这里把列表读回来，带下载与删除，数量直接显示在按钮上。
 * `refreshToken` 变化（例如刚上传完）时重新拉取。
 */
export function CloudAttachments({
  ownerType,
  ownerId,
  refreshToken = 0,
  label = "查看附件",
}: {
  ownerType: string;
  ownerId: string;
  refreshToken?: number;
  label?: string;
}) {
  const [items, setItems] = useState<CloudAttachment[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ownerId) return;
    try {
      const response = await fetch(`/api/cloud/attachments/${encodeURIComponent(ownerType)}/${encodeURIComponent(ownerId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(String(data.error ?? "附件加载失败"));
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(error instanceof Error ? error.message : "附件加载失败", "error");
    }
  }, [ownerId, ownerType]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function remove(attachment: CloudAttachment) {
    if (!await confirmDialog(`删除附件「${attachment.fileName}」吗？`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/cloud/attachments/${encodeURIComponent(attachment.id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data.error ?? "删除失败"));
      notify("附件已删除", "success");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "删除失败", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative inline-flex">
      <button
        aria-expanded={open}
        aria-label={label}
        className="inline-flex h-8 items-center gap-1 rounded border border-line bg-white px-2 text-xs text-ink-2 hover:border-primary hover:text-primary"
        onClick={() => setOpen((value) => !value)}
        title={label}
        type="button"
      >
        <Paperclip size={13} />
        {items.length ? items.length : ""}
      </button>
      {open ? (
        <div className="absolute right-0 top-9 z-30 w-72 rounded-lg border border-line-soft bg-surface p-2 shadow-lg">
          {!items.length ? (
            <div className="px-2 py-3 text-center text-xs text-ink-3">暂无附件</div>
          ) : (
            items.map((item) => (
              <div className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-surface-2" key={item.id}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink" title={item.fileName}>{item.fileName}</span>
                  <span className="text-ink-4">{formatSize(item.fileSize)}</span>
                </span>
                <a
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-ink-3 hover:bg-canvas hover:text-primary"
                  href={`/api/cloud/attachments/${encodeURIComponent(item.id)}`}
                  title="下载"
                >
                  <FileDown size={13} />
                </a>
                <button
                  aria-label="删除附件"
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-ink-3 hover:bg-canvas hover:text-danger disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void remove(item)}
                  title="删除"
                  type="button"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </span>
  );
}
