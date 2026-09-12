"use client";

import { useLayoutEffect, useRef } from "react";
import { clsx } from "clsx";

/**
 * 自动增高的文本域。
 *
 * 默认只有一行高（与 Input 一致），内容换行时自动长高，最多长到 maxHeight。
 * 用于「调整原因」这类放在多列表单网格里的字段：用普通 Textarea 会把整行
 * 撑到 80px 以上，用 Input 又写不下长文本。
 */
export function AutoGrowTextarea({
  value,
  maxHeight = 120,
  className,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & {
  value: string;
  maxHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);

  return (
    <textarea
      {...props}
      className={clsx(
        "min-h-9 w-full resize-none overflow-y-auto rounded border border-line bg-white px-3 py-2 text-sm leading-5 outline-none transition-colors placeholder:text-ink-4 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-3",
        className,
      )}
      ref={ref}
      rows={1}
      value={value}
    />
  );
}
