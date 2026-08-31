import type { ReactNode } from "react";

type StatusTagProps = {
  status: string;
  label: string;
  children?: ReactNode;
};

export function StatusTag({ status, label, children }: StatusTagProps) {
  const className = status === "draft"
    ? "bg-[#f4f4f5] text-[#606266]"
    : status === "confirmed" || status === "closed"
      ? "bg-[#f0f9eb] text-[#67c23a]"
      : status === "procurement_completed"
        ? "bg-[#ecf5ff] text-[#409eff]"
        : status === "accepting"
          ? "bg-[#f0f0ff] text-[#626aef]"
          : "bg-[#fdf6ec] text-[#e6a23c]";

  return <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${className}`}>{children ?? label}</span>;
}
