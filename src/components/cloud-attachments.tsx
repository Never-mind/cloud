"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 * 华为云附件的"查看 / 下载 / 删除"入口。
 *
 * 面板显示在按钮正下方，但用 **Portal 挂到 body + position: fixed** 渲染：
 * 直接写成单元格里的绝对定位会被表格的 `overflow: auto` 裁掉、还会被后面的行盖住。
 * 坐标由触发按钮的 getBoundingClientRect 算出，右对齐到按钮右边缘，所以不会溢出屏幕。
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
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  // 点面板外、按 Esc、或页面滚动/缩放导致位置失效时收起。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setAnchor({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
    }
    setOpen(true);
  }

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
    <>
      <button
        aria-expanded={open}
        aria-label={label}
        className="inline-flex h-8 items-center gap-1 rounded border border-line bg-white px-2 text-xs text-ink-2 hover:border-primary hover:text-primary"
        onClick={toggle}
        ref={buttonRef}
        title={label}
        type="button"
      >
        <Paperclip size={13} />
        {items.length ? items.length : ""}
      </button>
      {open && anchor && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[150] w-80 rounded-lg border border-line-soft bg-surface p-2 shadow-lg"
              ref={panelRef}
              style={{ top: anchor.top, right: anchor.right }}
            >
              <div className="px-2 pb-1 text-xs text-ink-3">{label}（{items.length}）</div>
              {!items.length ? (
                <div className="px-2 py-4 text-center text-xs text-ink-3">暂无附件</div>
              ) : (
                items.map((item) => (
                  <div className="flex items-center gap-2 rounded px-2 py-2 text-xs hover:bg-surface-2" key={item.id}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink" title={item.fileName}>{item.fileName}</span>
                      <span className="text-ink-4">{formatSize(item.fileSize)}</span>
                    </span>
                    <a
                      className="inline-flex h-6 items-center gap-1 rounded border border-line bg-white px-1.5 text-ink-2 hover:border-primary hover:text-primary"
                      href={`/api/cloud/attachments/${encodeURIComponent(item.id)}`}
                      title="下载"
                    >
                      <FileDown size={12} />
                      下载
                    </a>
                    <button
                      aria-label="删除附件"
                      className="inline-flex h-6 items-center gap-1 rounded border border-line bg-white px-1.5 text-ink-2 hover:border-danger hover:text-danger disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void remove(item)}
                      title="删除"
                      type="button"
                    >
                      <Trash2 size={12} />
                      删除
                    </button>
                  </div>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
