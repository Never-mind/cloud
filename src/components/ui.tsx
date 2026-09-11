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
    default: "border border-[#dcdfe6] bg-white text-[#606266] hover:border-[#c6cbd4] hover:bg-[#f7f8fa]",
    primary: "border border-[#1890ff] bg-[#1890ff] text-white hover:border-[#0f7ae0] hover:bg-[#0f7ae0]",
    success: "border border-[#13ce66] bg-[#13ce66] text-white hover:border-[#0fb457] hover:bg-[#0fb457]",
    // 原来的 #ffba00 配白字对比度只有 1.7:1，改成深棕文字后约 5.8:1。
    warning: "border border-[#ffba00] bg-[#ffba00] text-[#5a3d00] hover:border-[#f0a900] hover:bg-[#f0a900]",
    danger: "border border-[#f56c6c] bg-[#fff0f0] text-[#f56c6c] hover:border-[#f78989] hover:bg-[#fde2e2]",
  };

  return (
    <button
      {...props}
      className={clsx(
        // 用背景色变化代替整体 opacity：白底按钮 hover 时不再发灰，同时补上键盘焦点样式。
        "inline-flex h-9 min-w-0 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#1890ff]/35 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
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
        "h-9 min-w-0 max-w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm outline-none transition-colors placeholder:text-[#c0c4cc] focus:border-[#1890ff] focus:ring-2 focus:ring-[#1890ff]/20 disabled:cursor-not-allowed disabled:bg-[#f5f7fa] disabled:text-[#909399]",
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
        "min-h-20 min-w-0 max-w-full rounded border border-[#dcdfe6] bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-[#c0c4cc] focus:border-[#1890ff] focus:ring-2 focus:ring-[#1890ff]/20 disabled:cursor-not-allowed disabled:bg-[#f5f7fa] disabled:text-[#909399]",
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
