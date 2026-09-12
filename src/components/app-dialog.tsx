"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { Button } from "./ui";

/**
 * 全局确认框与轻提示。
 *
 * 用法（替代浏览器原生 confirm / alert）：
 *   if (!(await confirmDialog("确认删除？"))) return;
 *   await confirmDialog({ title: "退回草稿", message: "…", tone: "warning", confirmText: "退回" });
 *   notify("保存成功", "success");
 *
 * 宿主 <AppDialogHost /> 挂在 AppShell 上，覆盖所有页面。
 */

export type ConfirmOptions = {
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "primary" | "warning" | "danger";
};

export type NoticeTone = "success" | "error" | "info";

type ConfirmRequest = ConfirmOptions & { id: number; resolve: (value: boolean) => void };
type NoticeRequest = { id: number; message: string; tone: NoticeTone };

let confirmHandler: ((options: ConfirmOptions) => Promise<boolean>) | null = null;
let noticeHandler: ((notice: { message: string; tone: NoticeTone }) => void) | null = null;

export function confirmDialog(messageOrOptions: string | ConfirmOptions): Promise<boolean> {
  const options = typeof messageOrOptions === "string" ? { message: messageOrOptions } : messageOrOptions;
  // 宿主尚未挂载时退回原生确认，保证业务流程不会因为弹窗缺失而中断。
  if (!confirmHandler) {
    if (typeof window === "undefined") return Promise.resolve(false);
    return Promise.resolve(window.confirm(options.message));
  }
  return confirmHandler(options);
}

export function notify(message: string, tone: NoticeTone = "info") {
  if (!noticeHandler) return;
  noticeHandler({ message: String(message ?? ""), tone });
}

const NOTICE_DURATION_MS = 4_000;

export function AppDialogHost() {
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [notices, setNotices] = useState<NoticeRequest[]>([]);
  const sequence = useRef(0);
  const queue = useRef<ConfirmRequest[]>([]);

  const showNextConfirm = useCallback(() => {
    const next = queue.current.shift() ?? null;
    setConfirmRequest(next);
  }, []);

  useEffect(() => {
    confirmHandler = (options) =>
      new Promise<boolean>((resolve) => {
        const request: ConfirmRequest = { ...options, id: ++sequence.current, resolve };
        setConfirmRequest((current) => {
          if (current) {
            queue.current.push(request);
            return current;
          }
          return request;
        });
      });
    noticeHandler = ({ message, tone }) => {
      const notice: NoticeRequest = { id: ++sequence.current, message, tone };
      setNotices((current) => [...current, notice].slice(-4));
      window.setTimeout(() => {
        setNotices((current) => current.filter((item) => item.id !== notice.id));
      }, NOTICE_DURATION_MS);
    };
    return () => {
      confirmHandler = null;
      noticeHandler = null;
    };
  }, []);

  const finishConfirm = useCallback(
    (result: boolean) => {
      setConfirmRequest((current) => {
        current?.resolve(result);
        return null;
      });
      // 等当前这一帧渲染完再弹下一条，避免直接覆盖状态
      window.setTimeout(showNextConfirm, 0);
    },
    [showNextConfirm],
  );

  useEffect(() => {
    if (!confirmRequest) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishConfirm(false);
      if (event.key === "Enter") finishConfirm(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmRequest, finishConfirm]);

  return (
    <>
      {confirmRequest ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded border border-line-soft bg-white shadow-xl">
            <div className="flex items-start gap-3 border-b border-line-soft px-4 py-3">
              <span className={`mt-0.5 ${confirmToneIconClass(confirmRequest.tone)}`}>
                <AlertTriangle size={18} />
              </span>
              <div className="min-w-0 flex-1 font-medium text-ink">{confirmRequest.title ?? "操作确认"}</div>
              <button
                aria-label="关闭"
                className="text-ink-3 transition-colors hover:text-ink"
                onClick={() => finishConfirm(false)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto whitespace-pre-line px-4 py-4 text-sm text-ink-2">
              {confirmRequest.message}
            </div>
            <div className="flex justify-end gap-2 border-t border-line-soft px-4 py-3">
              <Button onClick={() => finishConfirm(false)}>{confirmRequest.cancelText ?? "取消"}</Button>
              <Button autoFocus onClick={() => finishConfirm(true)} tone={confirmRequest.tone ?? "primary"}>
                {confirmRequest.confirmText ?? "确定"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {notices.length ? (
        <div aria-live="polite" className="pointer-events-none fixed right-4 top-4 z-[95] flex w-[min(90vw,360px)] flex-col gap-2">
          {notices.map((notice) => (
            <div
              className={`pointer-events-auto flex items-start gap-2 rounded border bg-white px-3 py-2.5 text-sm shadow-lg ${noticeToneClass(notice.tone)}`}
              key={notice.id}
              role="status"
            >
              <span className="mt-0.5 shrink-0">{noticeIcon(notice.tone)}</span>
              <span className="min-w-0 flex-1 whitespace-pre-line break-words text-ink-2">{notice.message}</span>
              <button
                aria-label="关闭提示"
                className="shrink-0 text-ink-3 transition-colors hover:text-ink"
                onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))}
                type="button"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function confirmToneIconClass(tone: ConfirmOptions["tone"]) {
  if (tone === "danger") return "text-danger";
  if (tone === "warning") return "text-warning-border";
  return "text-primary";
}

function noticeToneClass(tone: NoticeTone) {
  if (tone === "success") return "border-success-border";
  if (tone === "error") return "border-[#fbc4c4]";
  return "border-line";
}

function noticeIcon(tone: NoticeTone) {
  if (tone === "success") return <CheckCircle2 className="text-success-strong" size={16} />;
  if (tone === "error") return <AlertTriangle className="text-danger" size={16} />;
  return <Info className="text-primary" size={16} />;
}
