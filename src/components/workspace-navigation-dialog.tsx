"use client";

import { ExternalLink, X } from "lucide-react";
import { Button } from "./ui";

export function WorkspaceNavigationDialog({
  title,
  message,
  detail,
  onStay,
  onOpen,
}: {
  title: string;
  message: string;
  detail?: string;
  onStay: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="workspace-navigation-title">
      <div className="w-full max-w-[460px] rounded border border-line-soft bg-white shadow-xl">
        <div className="flex items-center border-b border-line-soft px-5 py-4">
          <h2 id="workspace-navigation-title" className="font-medium text-ink">{title}</h2>
          <button className="ml-auto text-ink-3 hover:text-ink" type="button" title="关闭" aria-label="关闭" onClick={onStay}>
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-6">
          <p className="text-sm text-ink-2">{message}</p>
          {detail ? <p className="mt-2 break-all text-xs text-ink-3">{detail}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-line-soft px-5 py-4">
          <Button onClick={onStay}>留在当前页</Button>
          <Button tone="primary" onClick={onOpen}>
            <ExternalLink size={15} />
            查看明细
          </Button>
        </div>
      </div>
    </div>
  );
}
