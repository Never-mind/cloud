type PrepaymentFinanceStatusProps = {
  status: string | null | undefined;
};

/** Match the service-fee invoice/receipt pills, including partial contract progress. */
export function PrepaymentFinanceStatus({ status }: PrepaymentFinanceStatusProps) {
  const label = status?.trim() || "-";
  const tone = label === "已开票" || label === "已收款"
    ? "border-success-border bg-success-soft text-success"
    : label === "未收款" || label === "待设置口径" || label.startsWith("部分")
      ? "border-warning-border-soft bg-warning-soft text-warning-ink"
      : label.startsWith("超额")
        ? "border-danger-border bg-danger-soft text-danger"
        : "border-line-soft bg-canvas text-ink-3";

  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${tone}`}>{label}</span>;
}
