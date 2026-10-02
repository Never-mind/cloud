"use client";

import { useRef, useState } from "react";
import { Button } from "./ui";
import { notify } from "./app-dialog";

/**
 * 签章图控件。
 *
 * 选择图片后转成 data URI 交给表单提交（隐藏 textarea 参与 FormData），
 * 票面渲染时直接内联这段 base64 —— 不依赖 OBS 链接是否过期，打印/转 PDF 都不会丢章。
 */
export function SignatureField({
  defaultValue = "",
  name,
  onChange,
  value: controlledValue,
}: {
  defaultValue?: string;
  /** 受控用法（详情页草稿）：传了 onChange 就用 value/onChange，不再自己维护状态 */
  name?: string;
  onChange?: (value: string) => void;
  value?: string;
}) {
  const controlled = typeof onChange === "function";
  const [internal, setInternal] = useState(defaultValue);
  const value = controlled ? String(controlledValue ?? "") : internal;
  const setValue = (next: string) => (controlled ? onChange?.(next) : setInternal(next));
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-2">
      {controlled ? null : <textarea className="hidden" name={name} readOnly value={value} />}
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          <img alt="签章预览" className="h-12 max-w-[200px] rounded border border-line-soft bg-white object-contain p-1" src={value} />
        ) : (
          <span className="text-xs text-ink-3">未设置，票面不显示签章</span>
        )}
        <input
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            // 票面里是 base64 内联，1MB 的章 ≈ 1.4MB 的票面文件，够用又不至于把票面撑爆
            if (file.size > 1024 * 1024) { notify("签章图请控制在 1 MB 以内，否则票面文件会很大", "error"); return; }
            const reader = new FileReader();
            reader.onload = () => setValue(String(reader.result ?? ""));
            reader.onerror = () => notify("图片读取失败", "error");
            reader.readAsDataURL(file);
          }}
          ref={inputRef}
          type="file"
        />
        <Button onClick={() => inputRef.current?.click()} size="sm" type="button">选择图片</Button>
        {value ? <Button onClick={() => setValue("")} size="sm" tone="danger" type="button">清除</Button> : null}
      </div>
      <p className="text-xs text-ink-3">建议 PNG 透明底；单个文件 ≤1 MB，图片以 base64 内联进票面，不依赖外部链接。</p>
    </div>
  );
}
