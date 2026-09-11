"use client";

import { useCallback, useEffect, useRef } from "react";
import type { TableFilterOption } from "@/components/table-column-menu";

/**
 * Makes concurrent list loads last-write-wins. This prevents a slower request
 * started before a filter or sort change from replacing the newer result.
 */
export function useRequestGuard() {
  const requestSequence = useRef(0);

  useEffect(() => () => {
    requestSequence.current += 1;
  }, []);

  return useCallback(() => {
    const requestId = ++requestSequence.current;
    return () => requestId === requestSequence.current;
  }, []);
}

export async function fetchTableFilterOptions(
  endpoint: string,
  field: string,
  keyword: string,
  extraParams: Record<string, string> = {},
  filters: Record<string, string[]> = {},
  filterPrefix = "filter",
): Promise<TableFilterOption[]> {
  const params = new URLSearchParams({ field, ...extraParams });
  if (keyword.trim()) params.set("keyword", keyword.trim());
  for (const [filterField, values] of Object.entries(filters)) {
    if (filterField === field) continue;
    for (const value of values) params.append(`${filterPrefix}.${filterField}`, value);
  }
  const response = await fetch(`${endpoint}?${params.toString()}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "筛选候选值加载失败");
  return (data.options ?? []) as TableFilterOption[];
}
