"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * 表单类弹窗的统一外壳。
 *
 * 统一了遮罩浓度、层级、圆角、标题区、内容区与底部按钮区，业务页面只写表单内容：
 *
 *   <Modal title="新建合同" description="…" onClose={close} footer={<><Button onClick={close}>取消</Button><Button tone="primary" onClick={save}>保存</Button></>}>
 *     …表单字段…
 *   </Modal>
 *
 * 需要把整个弹窗作为表单提交时传 panelAs="form" 与 panelProps={{ action: saveRow }}。
 */

/** 弹层层级约定：普通弹窗 100，确认框 90，轻提示 95，工作区导航 130。 */
export const MODAL_Z_INDEX = "z-[100]";

type ModalProps = {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  /** 面板宽度，例如 max-w-xl / w-[820px] */
  widthClass?: string;
  /** 层级，默认与普通弹窗一致；工作区导航等场景可覆盖 */
  zClass?: string;
  children: ReactNode;
  footer?: ReactNode;
  panelAs?: "div" | "form";
  panelProps?: Record<string, unknown>;
};

export function Modal({
  title,
  description,
  onClose,
  widthClass = "max-w-2xl",
  zClass = MODAL_Z_INDEX,
  children,
  footer,
  panelAs = "div",
  panelProps,
}: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const panelClass = `max-h-[88vh] w-full ${widthClass} overflow-auto rounded border border-line-soft bg-white shadow-xl`;
  const content = (
    <>
      <div className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-medium text-ink">{title}</h2>
          {description ? <p className="mt-1 text-xs text-ink-3">{description}</p> : null}
        </div>
        <button
          aria-label="关闭"
          className="shrink-0 text-ink-3 transition-colors hover:text-ink"
          onClick={onClose}
          type="button"
        >
          <X size={17} />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer ? <div className="flex justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</div> : null}
    </>
  );

  return (
    <div
      aria-modal="true"
      className={`fixed inset-0 ${zClass} flex items-center justify-center bg-black/40 p-4`}
      role="dialog"
    >
      {panelAs === "form" ? (
        <form className={panelClass} {...panelProps}>
          {content}
        </form>
      ) : (
        <div className={panelClass} {...panelProps}>
          {content}
        </div>
      )}
    </div>
  );
}
