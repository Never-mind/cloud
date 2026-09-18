"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Input } from "./ui";

/**
 * 统一的"搜索 + 选择"控件。
 *
 * 替代三套历史实现（各页自研的 SearchPicker / PartnerSelect / PartnerLookup）
 * 以及 11 处浏览器原生 `<datalist>`：
 *
 * - 外观复用 `Input`，右侧固定图标；
 * - 下拉面板统一 `fixed` 定位（不会被表格 overflow 裁切）、统一圆角/阴影/滚动条；
 * - 选项两行显示：第一行主值（编码），第二行灰色说明（机型 / 英文名等）；
 * - 支持 ↑↓ 移动、Enter 选中、Esc 关闭、Tab 关闭；
 * - 只允许从选项中选择，不接受自由输入。
 */

export type SearchSelectOption = {
  /** 选中后真正提交的值，通常是 id 或编码。 */
  value: string;
  /** 输入框里回显的主文本；不传时用 value。 */
  label?: string;
  /** 下拉里的第一行前缀，通常是编码。 */
  code?: string;
  /** 下拉里的第二行灰色说明，例如机型 / 英文名 / 规格。 */
  hint?: string;
  /** 额外的搜索关键词（不展示）。 */
  keywords?: string;
};

const DEFAULT_MAX_VISIBLE = 50;
const MENU_MIN_WIDTH = 260;

export function SearchSelect({
  className,
  clearable = false,
  disabled = false,
  emptyText = "暂无匹配选项",
  loading = false,
  maxVisible = DEFAULT_MAX_VISIBLE,
  onChange,
  onSearch,
  options,
  placeholder = "输入关键词搜索",
  value,
}: {
  className?: string;
  clearable?: boolean;
  disabled?: boolean;
  emptyText?: string;
  loading?: boolean;
  maxVisible?: number;
  onChange: (value: string, option: SearchSelectOption | null) => void;
  /** 需要远端搜索时传入；返回结果由调用方通过 options 回填。 */
  onSearch?: (keyword: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  value: string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0, width: MENU_MIN_WIDTH });

  const selected = options.find((option) => option.value === value);
  const selectedLabel = selected ? selected.label ?? selected.value : value;

  const keyword = query.trim().toLowerCase();
  const matched = keyword
    ? options.filter((option) =>
        `${option.value} ${option.code ?? ""} ${option.label ?? ""} ${option.hint ?? ""} ${option.keywords ?? ""}`
          .toLowerCase()
          .includes(keyword))
    : options;
  const visible = matched.slice(0, maxVisible);
  const truncated = matched.length > visible.length;

  // 输入框不聚焦时回显已选项
  useEffect(() => {
    if (!open) setQuery(selectedLabel);
  }, [open, selectedLabel]);

  useEffect(() => {
    setActiveIndex(0);
  }, [keyword, open]);

  // 面板用 fixed 定位，跟随输入框移动；滚动或缩放时重新计算
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        left: rect.left,
        top: rect.bottom + 4,
        width: Math.max(rect.width, MENU_MIN_WIDTH),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  // 点击面板以外关闭
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if ((target as HTMLElement)?.closest?.("[data-search-select-panel]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function openMenu() {
    if (disabled) return;
    setQuery("");
    setOpen(true);
    onSearch?.("");
    window.setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit(option: SearchSelectOption | null) {
    setOpen(false);
    setQuery(option ? option.label ?? option.value : "");
    onChange(option?.value ?? "", option);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery(selectedLabel);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      setQuery(selectedLabel);
      return;
    }
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (visible.length ? (current + 1) % visible.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (visible.length ? (current - 1 + visible.length) % visible.length : 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = visible[activeIndex];
      if (option) commit(option);
    }
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <Input
        aria-autocomplete="list"
        aria-expanded={open}
        className={`${className ?? ""} ${clearable || !disabled ? "pr-8" : ""}`}
        disabled={disabled}
        placeholder={placeholder}
        ref={inputRef}
        role="combobox"
        value={open ? query : selectedLabel}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          onSearch?.(next);
        }}
        onFocus={openMenu}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // 清空输入即视为取消选择；否则回显已选项
          window.setTimeout(() => {
            if (open) return;
            if (!query.trim() && value) commit(null);
            else setQuery(selectedLabel);
          }, 0);
        }}
      />
      {clearable && value && !disabled ? (
        <button
          aria-label="清除选择"
          className="absolute right-2 top-2 text-ink-3 hover:text-danger"
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            commit(null);
          }}
        >
          <X size={15} />
        </button>
      ) : (
        <ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-ink-4" size={15} />
      )}
      {open && !disabled ? (
        <div
          className="fixed z-[120] max-h-64 overflow-y-auto rounded border border-line bg-white py-1 shadow-lg"
          data-search-select-panel=""
          style={menuPosition}
        >
          {loading ? (
            <div className="px-3 py-3 text-sm text-ink-3">加载中…</div>
          ) : visible.length ? (
            <>
              {visible.map((option, index) => (
                <button
                  className={`block w-full px-3 py-2 text-left text-sm ${index === activeIndex ? "bg-canvas" : "hover:bg-canvas"}`}
                  key={`${option.value}-${index}`}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(option);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="block truncate text-ink">
                    {option.code ? `${option.code} - ` : ""}
                    {option.label ?? option.value}
                  </span>
                  {option.hint ? <span className="mt-0.5 block truncate text-xs text-ink-3">{option.hint}</span> : null}
                </button>
              ))}
              {truncated ? (
                <div className="border-t border-line-soft px-3 py-2 text-xs text-ink-3">
                  共匹配 {matched.length} 条，仅显示前 {visible.length} 条，请继续输入缩小范围
                </div>
              ) : null}
            </>
          ) : (
            <div className="px-3 py-3 text-sm text-ink-3">{emptyText}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
