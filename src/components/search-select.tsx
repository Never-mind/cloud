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

/** 命中的关键词加粗，跟浏览器原生下拉的高亮一致。 */
function highlightMatch(text: string, keyword: string) {
  if (!keyword) return text;
  const index = text.toLowerCase().indexOf(keyword);
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <strong className="font-semibold">{text.slice(index, index + keyword.length)}</strong>
      {text.slice(index + keyword.length)}
    </>
  );
}

const DEFAULT_MAX_VISIBLE = 50;

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
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0, minWidth: 0, maxWidth: 480 });

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
        // 输入框下方留 4px 缝
        top: rect.bottom + 4,
        // 宽度按内容自适应（保证全称完整），最窄不窄于输入框，最宽不超出视口
        minWidth: rect.width,
        maxWidth: Math.max(200, window.innerWidth - rect.left - 12),
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
        className={`${className ?? ""} ${disabled ? "" : "pr-8"}`}
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
      ) : disabled ? null : (
        <ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-ink-4" size={15} />
      )}
      {open && !disabled ? (
        <div
          className="fixed z-[120] max-h-72 overflow-y-auto overflow-x-hidden rounded border border-line bg-white py-0.5 shadow-lg"
          data-search-select-panel=""
          style={{
            left: menuPosition.left,
            top: menuPosition.top,
            width: "max-content",
            minWidth: menuPosition.minWidth,
            maxWidth: menuPosition.maxWidth,
          }}
        >
          {loading ? (
            <div className="px-3 py-1.5 text-xs text-ink-3">加载中…</div>
          ) : visible.length ? (
            <>
              {visible.map((option, index) => (
                <button
                  className={`flex w-full flex-col gap-1 px-3 py-1.5 text-left ${
                    index === activeIndex ? "bg-canvas-deep" : "hover:bg-canvas-deep"
                  }`}
                  key={`${option.value}-${index}`}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(option);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  {/* 主值：加粗、字号略大 */}
                  <span className="w-full truncate text-sm font-semibold text-ink">
                    {highlightMatch(option.label ?? option.value, keyword)}
                  </span>
                  {/* 补充文字：不加粗、12px 灰色 */}
                  {option.hint ? (
                    <span className="w-full truncate text-xs text-ink-3">
                      {highlightMatch(option.hint, keyword)}
                    </span>
                  ) : null}
                </button>
              ))}
              {truncated ? (
                <div className="border-t border-line-soft px-3 py-1.5 text-xs text-ink-3">
                  共匹配 {matched.length} 条，仅显示前 {visible.length} 条，请继续输入缩小范围
                </div>
              ) : null}
            </>
          ) : (
            <div className="px-3 py-1.5 text-xs text-ink-3">{emptyText}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
