const quantityFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 });

export function QuantitySummaryBar({
  pageQuantity,
  totalQuantity,
  loading,
}: {
  pageQuantity: number;
  totalQuantity: number;
  loading: boolean;
}) {
  return (
    <div aria-busy={loading} aria-live="polite" className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line-soft bg-slate-50 px-4 py-3 text-sm text-ink-2">
      <span>本页数量合计：<strong className="tabular-nums text-ink-1">{loading ? "计算中…" : quantityFormatter.format(pageQuantity)}</strong></span>
      <span>筛选结果数量合计：<strong className="tabular-nums text-brand">{loading ? "计算中…" : quantityFormatter.format(totalQuantity)}</strong></span>
      <span className="text-xs text-ink-3">按当前筛选条件汇总，包含所有分页</span>
    </div>
  );
}
