"use client";

import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

type StatusSwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "onClick" | "children" | "type" | "role" | "aria-checked"> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  onLabel: string;
  offLabel: string;
};

export function StatusSwitch({ checked, onChange, onLabel, offLabel, className, ...props }: StatusSwitchProps) {
  return (
    <button
      {...props}
      aria-checked={checked}
      aria-label={props["aria-label"] ?? `${offLabel} / ${onLabel}`}
      className={clsx("inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded text-sm text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", className)}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span aria-hidden="true" className={clsx("relative inline-flex h-5 w-10 shrink-0 rounded-full transition-colors motion-reduce:transition-none", checked ? "bg-success" : "bg-ink-4")}>
        <span className={clsx("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform motion-reduce:transition-none", checked ? "translate-x-5" : "translate-x-0")} />
      </span>
      <span>{checked ? onLabel : offLabel}</span>
    </button>
  );
}
