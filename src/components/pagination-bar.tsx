"use client";

import { useState } from "react";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, getPaginationState } from "@/lib/pagination";
import { Button, Input } from "./ui";

export function PaginationBar({
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize?: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const state = getPaginationState(total, page, pageSize);
  const [targetPage, setTargetPage] = useState("");

  function jumpToTargetPage() {
    onPageChange(Number(targetPage || state.page));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line-soft p-4 text-sm text-ink-2">
      <span>共 {state.total} 条</span>
      <span>
        当前 {state.start}-{state.end} 条
      </span>
      <select
        className="h-9 rounded border border-line bg-white px-2 text-sm outline-none focus:border-primary"
        value={state.pageSize}
        onChange={(event) => {
          onPageSizeChange?.(Number(event.target.value));
          onPageChange(1);
        }}
      >
        {PAGE_SIZE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option} 条/页
          </option>
        ))}
      </select>
      <Button disabled={state.page <= 1} onClick={() => onPageChange(state.page - 1)}>
        上一页
      </Button>
      <span>
        第 {state.page} / {state.totalPages} 页
      </span>
      <Button disabled={state.page >= state.totalPages} onClick={() => onPageChange(state.page + 1)}>
        下一页
      </Button>
      <span className="ml-2">跳至</span>
      <Input
        aria-label="跳转页码"
        // number 输入框右侧的原生上下箭头会占掉近 20px，42px 宽度下数字几乎看不见；
        // 这里加宽并隐藏箭头，保留居中显示。
        className="h-8 w-14 shrink-0 px-2 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        max={state.totalPages}
        min={1}
        type="number"
        value={targetPage}
        onChange={(event) => setTargetPage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          jumpToTargetPage();
        }}
      />
      <Button onClick={jumpToTargetPage}>
        跳转
      </Button>
    </div>
  );
}
