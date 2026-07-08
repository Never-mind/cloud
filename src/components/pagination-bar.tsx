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
    <div className="flex flex-wrap items-center gap-2 border-t border-[#ebeef5] p-4 text-sm text-[#606266]">
      <span>共 {state.total} 条</span>
      <span>
        当前 {state.start}-{state.end} 条
      </span>
      <select
        className="h-9 rounded border border-[#dcdfe6] bg-white px-2 text-sm outline-none focus:border-[#1890ff]"
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
        className="h-8 min-w-0 px-1 text-center text-xs"
        max={state.totalPages}
        min={1}
        style={{ width: 42 }}
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
