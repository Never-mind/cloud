"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * 右侧抽屉的统一外壳。
 *
 * 业务只写标题与内容，遮罩浓度、层级、面板宽度、标题区与底部按钮区都在这里统一：
 *
 *   <Drawer title={<><Calculator size={19} />算力服务费测算</>} description="…" onClose={close} footer={<Button onClick={close}>取消</Button>}>
 *     …内容…
 *   </Drawer>
 *
 * 注意：遮罩层级必须低于面板层级，否则面板会被遮罩盖住而无法点击。
 */

/** 抽屉层级约定：遮罩 90，面板 100（面板必须高于遮罩）。 */
export const DRAWER_BACKDROP_Z_INDEX = "z-[90]";
export const DRAWER_Z_INDEX = "z-[100]";

type DrawerProps = {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  /** 面板宽度，例如 max-w-[700px] */
  widthClass?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function Drawer({
  title,
  description,
  onClose,
  widthClass = "max-w-[720px]",
  children,
  footer,
}: DrawerProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <button
        aria-label="关闭侧边面板"
        className={`fixed inset-0 ${DRAWER_BACKDROP_Z_INDEX} bg-black/40`}
        onClick={onClose}
        type="button"
      />
      <aside
        aria-modal="true"
        className={`fixed inset-y-0 right-0 ${DRAWER_Z_INDEX} flex w-full ${widthClass} flex-col border-l border-line bg-white shadow-2xl`}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-lg font-medium text-ink">{title}</div>
            {description ? <div className="mt-1 text-xs text-ink-3">{description}</div> : null}
          </div>
          <button
            aria-label="关闭"
            className="shrink-0 text-ink-3 hover:text-ink"
            onClick={onClose}
            title="关闭"
            type="button"
          >
            <X size={19} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</div>
        ) : null}
      </aside>
    </>
  );
}
