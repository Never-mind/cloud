"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "./ui";
import { Modal } from "./modal";

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
    <Modal
      footer={
        <>
          <Button onClick={onStay}>留在当前页</Button>
          <Button tone="primary" onClick={onOpen}>
            <ExternalLink size={15} />
            查看明细
          </Button>
        </>
      }
      onClose={onStay}
      title={title}
      widthClass="max-w-[460px]"
      zClass="z-[130]"
    >
      <div className="space-y-2 py-1">
        <p className="text-sm text-ink-2">{message}</p>
        {detail ? <p className="break-all text-xs text-ink-3">{detail}</p> : null}
      </div>
    </Modal>
  );
}
