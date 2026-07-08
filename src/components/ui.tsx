import { clsx } from "clsx";

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
        "inline-flex h-9 items-center justify-center gap-1 rounded px-3 text-sm transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50",
        tones[tone],
        props.className,
      )}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "h-9 min-w-[180px] rounded border border-[#dcdfe6] bg-white px-3 text-sm outline-none focus:border-[#1890ff]",
        props.className,
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        "min-h-20 rounded border border-[#dcdfe6] bg-white px-3 py-2 text-sm outline-none focus:border-[#1890ff]",
        props.className,
      )}
    />
  );
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("border border-[#ebeef5] bg-white shadow-sm", className)}>{children}</div>
  );
}
