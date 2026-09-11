import type { ReactNode } from "react";

type StatusTagProps = {
  status: string;
  label: string;
  children?: ReactNode;
};

export function StatusTag({ status, label, children }: StatusTagProps) {
  const className = status === "draft"
    ? "bg-fill-soft text-ink-2"
    : status === "confirmed" || status === "closed"
      ? "bg-success-soft text-success-strong"
      : status === "procurement_completed"
        ? "bg-info-soft text-info"
        : status === "accepting"
          ? "bg-[#f0f0ff] text-[#626aef]"
          : "bg-warning-soft text-warning-deep";

  return <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${className}`}>{children ?? label}</span>;
}
