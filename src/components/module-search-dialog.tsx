"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { searchModules, type ModuleSearchEntry } from "@/lib/module-search";

/**
 * 功能模块搜索弹层：Ctrl/Cmd + K 唤起，支持中文名、拼音首字母、业务别名。
 * 传入的 entries 已按功能开关与权限过滤，所以停用的功能搜不到。
 */
export function ModuleSearchDialog({
  open,
  entries,
  onClose,
  onSelect,
}: {
  open: boolean;
  entries: ModuleSearchEntry[];
  onClose: () => void;
  onSelect: (entry: ModuleSearchEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => searchModules(query, entries), [query, entries]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const keyword = query.trim();
  const selected = hits[Math.min(active, Math.max(hits.length - 1, 0))];

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => Math.min(value + 1, Math.max(hits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter" && selected) {
      event.preventDefault();
      onSelect(selected);
    }
  }

  let lastDomain = "";

  return (
    <div className="fixed inset-0 z-[140] flex items-start justify-center bg-black/25 px-4 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-line-soft bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2.5">
          <Search className="shrink-0 text-ink-3" size={16} />
          <input
            ref={inputRef}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-4"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索功能模块，支持拼音首字母与别名，如 月账 / yzd / 交单"
            value={query}
          />
          <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-3">Esc</span>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {!hits.length ? (
            <div className="px-4 py-10 text-center text-sm text-ink-3">
              没有找到与「{keyword}」匹配的功能
              <div className="mt-2 text-xs">试试搜 月账、核销、对账、发票，或拼音首字母如 yzd</div>
            </div>
          ) : (
            hits.map((hit, index) => {
              const showDomain = hit.domain !== lastDomain;
              lastDomain = hit.domain;
              return (
                <div key={hit.key}>
                  {showDomain ? <div className="px-2.5 pb-1 pt-2 text-[11px] text-ink-3">{hit.domain}</div> : null}
                  <button
                    className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                      index === active ? "bg-info-soft outline outline-1 outline-info-border" : "hover:bg-surface-2"
                    }`}
                    onClick={() => onSelect(hit)}
                    onMouseEnter={() => setActive(index)}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{hit.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-ink-3">{hit.description || hit.group}</span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap pt-0.5 text-[11px] text-ink-4">{hit.group}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line-soft px-3 py-2 text-[11px] text-ink-3">
          <span>↑ ↓ 选择</span>
          <span>Enter 打开</span>
          <span>Esc 关闭</span>
          <span className="ml-auto">{keyword ? `共 ${hits.length} 个功能` : `共 ${entries.length} 个功能`}</span>
        </div>
      </div>
    </div>
  );
}
