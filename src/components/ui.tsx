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
    // 层级约定：primary / success 用实心，表示主操作；default / warning / danger 用描边，
    // 表示次级或工具类操作。导出这类工具按钮不再用整块亮黄填充。
    default: "border border-line bg-white text-ink-2 hover:border-[#c6cbd4] hover:bg-[#f7f8fa]",
    primary: "border border-primary bg-primary text-white hover:border-primary-dark hover:bg-primary-dark",
    success: "border border-success bg-success text-white hover:border-success-dark hover:bg-success-dark",
    // 描边式提醒按钮：白底 + 琥珀边框 + 深琥珀文字（对比度约 6.4:1），hover 时浅琥珀底。
    warning: "border border-warning-deep bg-white text-[#8a5200] hover:border-[#d48806] hover:bg-warning-soft",
    danger: "border border-danger bg-danger-soft text-danger hover:border-[#f78989] hover:bg-danger-border",
  };

  return (
    <button
      {...props}
      className={clsx(
        // 用背景色变化代替整体 opacity：白底按钮 hover 时不再发灰，同时补上键盘焦点样式。
        "inline-flex h-9 min-w-0 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
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
        "h-9 min-w-0 max-w-full rounded border border-line bg-white px-3 text-sm outline-none transition-colors placeholder:text-ink-4 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-3",
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
        "min-h-20 min-w-0 max-w-full rounded border border-line bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-ink-4 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-3",
        props.className,
      )}
    />
  );
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    // 圆角与控件保持一致（4px）。overflow-hidden 让内部的表头色条、表格边框跟着圆角裁切，
    // 否则容器是圆角、里面是直角会显得拼凑。已确认浮层都用 createPortal 挂到 body，不会被裁切。
    <div className={clsx("min-w-0 max-w-full overflow-hidden rounded border border-line-soft bg-white shadow-sm", className)}>{children}</div>
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
    <div className="grid gap-3 border-t border-line-soft bg-surface-2 p-4 text-xs text-ink-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      {fields.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <span className="block">{label}</span>
          <span className="mt-1 block truncate text-sm text-ink-2" title={value == null ? "-" : String(value)}>{value == null || value === "" ? "-" : String(value)}</span>
        </div>
      ))}
    </div>
  );
}
