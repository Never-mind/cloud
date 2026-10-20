"use client";

/**
 * 采购订单详情页的附件区（上传 / 下载 / 删除）。
 *
 * 附件存在通用附件表（ownerType = purchase-orders），与「发起付款申请」时上传的
 * 发票/合同是同一份数据：付款申请里传过的附件，这里能直接下载。
 */
import { useCallback, useEffect, useState } from "react";
import { Download, FileUp, Trash2 } from "lucide-react";
import { confirmDialog, notify } from "./app-dialog";
import { formatDisplayValue } from "@/lib/display-format";
import { IconButton, IconLink } from "./ui";

type Attachment = {
  attachmentId: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string | null;
};

export function PurchaseOrderAttachments({ purchaseOrderId, readOnly = false }: { purchaseOrderId: string; readOnly?: boolean }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!purchaseOrderId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/common/attachments/purchase-orders/${encodeURIComponent(purchaseOrderId)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "附件加载失败");
      setAttachments(data.attachments ?? []);
    } catch (error) {
      notify(error instanceof Error ? error.message : "附件加载失败", "info");
    } finally {
      setLoading(false);
    }
  }, [purchaseOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch(`/api/common/attachments/purchase-orders/${encodeURIComponent(purchaseOrderId)}`, { method: "POST", body });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? `上传失败：${file.name}`);
      }
      notify("附件已上传", "success");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "附件上传失败", "info");
    } finally {
      setUploading(false);
    }
  }

  async function remove(attachment: Attachment) {
    if (!(await confirmDialog({ title: "删除附件", message: `确认删除「${attachment.fileName}」？`, tone: "danger" }))) return;
    try {
      const response = await fetch(
        `/api/common/attachments/purchase-orders/${encodeURIComponent(purchaseOrderId)}/${encodeURIComponent(attachment.attachmentId)}`,
        { method: "DELETE" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "删除失败");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "附件删除失败", "info");
    }
  }

  return (
    <section className="rounded border border-line-soft bg-white">
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
        <FileUp className="text-primary" size={17} />
        <h2 className="text-sm font-medium text-ink">附件</h2>
        <span className="text-xs text-ink-3">发票请在上方主单「发票与付款」上传并识别</span>
        <label
          className={`ml-auto inline-flex h-8 items-center gap-1 rounded border border-line px-3 text-sm ${
            readOnly || uploading ? "cursor-not-allowed text-ink-4" : "cursor-pointer text-ink-2 hover:border-primary hover:text-primary"
          }`}
        >
          {uploading ? "上传中…" : "上传附件"}
          <input className="hidden" disabled={readOnly || uploading} multiple type="file" onChange={(event) => { void upload(event.target.files); event.target.value = ""; }} />
        </label>
      </div>
      <div className="divide-y divide-line-soft">
        {loading ? <div className="px-4 py-6 text-center text-sm text-ink-3">加载中…</div> : null}
        {!loading && !attachments.length ? <div className="px-4 py-6 text-center text-sm text-ink-3">暂无附件</div> : null}
        {attachments.map((attachment) => (
          <div className="flex items-center gap-3 px-4 py-2.5 text-sm" key={attachment.attachmentId}>
            <FileUp className="shrink-0 text-ink-3" size={16} />
            <div className="min-w-0 flex-1">
              <strong className="block truncate font-normal text-ink">{attachment.fileName}</strong>
              <div className="text-xs text-ink-3">
                {formatFileSize(Number(attachment.fileSize ?? 0))}
                {attachment.uploadedAt ? ` · ${formatDisplayValue(attachment.uploadedAt as never, "datetime")}` : ""}
              </div>
            </div>
            <IconLink
              href={`/api/common/attachments/purchase-orders/${encodeURIComponent(purchaseOrderId)}/${encodeURIComponent(attachment.attachmentId)}`}
              label="下载"
            >
              <Download size={15} />
            </IconLink>
            {readOnly ? null : (
              <IconButton icon={<Trash2 size={15} />} label="删除" onClick={() => void remove(attachment)} tone="danger" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function formatFileSize(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
