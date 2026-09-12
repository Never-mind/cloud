"use client";

import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { normalizeNumericInputText, numericInputDisplayValue } from "@/lib/numeric-input";

/**
 * 数字输入框。
 *
 * 不能直接用 Input type=number 再在 onChange 里转数字，那样有两个问题：
 * 每敲一个字符就把文本转回数字，0.0 会被转成 0 再渲染回去，小于 1 的小数打不出来；
 * 值为 0 时输入框显示 0，用户接着输入 88 会变成 088。
 *
 * 这里输入过程中保留用户原文（内部 state），失焦时再按外部值规范化，
 * 并统一去掉前导 0、把 0 显示为空。onChange 抛给业务的是原始文本，由业务决定怎么转数字。
 */

type NumberInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "defaultValue"
> & {
  value: string | number | null | undefined;
  /** 返回用户输入的原始文本（未做数字转换）。 */
  onChange: (text: string) => void;
  /** 不加内置外观，完全由 className 控制（例如嵌在自定义边框里的价格输入）。 */
  bare?: boolean;
};

export function NumberInput({ value, onChange, className, onBlur, onFocus, bare, ...props }: NumberInputProps) {
  const [text, setText] = useState(() => numericInputDisplayValue(value));
  const editing = useRef(false);

  // 外部值变化（公式带入、重置、切换记录）时同步；编辑过程中不打断用户输入。
  useEffect(() => {
    if (editing.current) return;
    setText(numericInputDisplayValue(value));
  }, [value]);

  return (
    <input
      {...props}
      className={clsx(
        !bare &&
          "h-9 min-w-0 max-w-full rounded border border-line bg-white px-3 text-sm outline-none transition-colors placeholder:text-ink-4 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-3",
        className,
      )}
      onBlur={(event) => {
        editing.current = false;
        setText(numericInputDisplayValue(value));
        onBlur?.(event);
      }}
      onChange={(event) => {
        const next = normalizeNumericInputText(event.target.value);
        setText(next);
        onChange(next);
      }}
      onFocus={(event) => {
        editing.current = true;
        onFocus?.(event);
      }}
      type="number"
      value={text}
    />
  );
}
