import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

/**
 * 表格/列表的加载与空状态统一出口。
 *
 * 用法：把原来写在单元格里的 `{loading ? "加载中..." : "暂无数据"}` 换成
 * `<TableStateContent empty="暂无数据" loading={loading} />`，外层 <td colSpan> 保持不变。
 */
export function TableStateContent({
  loading,
  empty,
  hint,
  icon,
}: {
  loading: boolean;
  empty: string;
  hint?: string;
  icon?: ReactNode;
}) {
  if (loading) return <TableSkeleton />;
  return <EmptyState icon={icon} hint={hint} title={empty} />;
}

/** 加载骨架：三行灰条，避免"白屏后突然跳出数据"的跳变感。 */
export function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="mx-auto flex w-full max-w-4xl flex-col gap-3 py-1">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="flex items-center gap-4" key={index}>
          <div className="h-3.5 w-1/4 animate-pulse rounded bg-[#eef1f5]" />
          <div className="h-3.5 flex-1 animate-pulse rounded bg-[#eef1f5]" />
          <div className="hidden h-3.5 w-20 animate-pulse rounded bg-[#eef1f5] sm:block" />
        </div>
      ))}
    </div>
  );
}

/** 空状态：图标 + 主文案 + 可选补充说明。 */
export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-ink-4">{icon ?? <Inbox size={22} strokeWidth={1.5} />}</span>
      <span className="text-ink-2">{title}</span>
      {hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
    </div>
  );
}

/** 非表格区域的加载占位，替代裸的"加载中..."文字。 */
export function LoadingBlock({ text = "加载中" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-sm text-ink-3">
      <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#dcdfe6] border-t-[#1890ff]" />
      {text}
    </div>
  );
}
