import { clsx } from "clsx";
import { forwardRef } from "react";

export function Button({
  children,
  tone = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "default" | "primary" | "success" | "warning" | "danger";
}) {
  const tones = {
    default: "border border-[#dcdfe6] bg-white text-[#606266]",
    primary: "border border-[#1890ff] bg-[#1890ff] text-white",
    success: "border border-[#13ce66] bg-[#13ce66] text-white",
    warning: "border border-[#ffba00] bg-[#ffba00] text-white",
    danger: "border border-[#f56c6c] bg-[#fff0f0] text-[#f56c6c]",
  };

  return (
    <button
      {...props}
      className={clsx(
        "inline-flex h-9 min-w-0 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded px-3 text-sm transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50",
        tones[tone],
        props.className,
      )}
    >
      {children}
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={clsx(
        "h-9 min-w-0 max-w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm outline-none focus:border-[#1890ff]",
        props.className,
      )}
    />
  );
});

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        "min-h-20 min-w-0 max-w-full rounded border border-[#dcdfe6] bg-white px-3 py-2 text-sm outline-none focus:border-[#1890ff]",
        props.className,
      )}
    />
  );
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("min-w-0 max-w-full border border-[#ebeef5] bg-white shadow-sm", className)}>{children}</div>
  );
}

export function AuditInfoBar({
  createdBy,
  createdAt,
  updatedBy,
  updatedAt,
  confirmedBy,
  confirmedAt,
}: {
  createdBy?: unknown;
  createdAt?: unknown;
  updatedBy?: unknown;
  updatedAt?: unknown;
  confirmedBy?: unknown;
  confirmedAt?: unknown;
}) {
  const fields = [
    ["创建人", createdBy],
    ["创建时间", createdAt],
    ["更新人", updatedBy],
    ["更新时间", updatedAt],
    ["确认人", confirmedBy],
    ["确认时间", confirmedAt],
  ] as const;
  return (
    <div className="grid gap-3 border-t border-[#ebeef5] bg-[#fafafa] p-4 text-xs text-[#909399] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      {fields.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <span className="block">{label}</span>
          <span className="mt-1 block truncate text-sm text-[#606266]" title={value == null ? "-" : String(value)}>{value == null || value === "" ? "-" : String(value)}</span>
        </div>
      ))}
    </div>
  );
}
