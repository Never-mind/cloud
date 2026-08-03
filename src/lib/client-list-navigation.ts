"use client";

import { useEffect } from "react";

const LIST_SCROLL_PREFIX = "cloud-power-list-scroll:";

export function getPositiveNumber(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getCurrentRoute(pathname: string, search: string) {
  return search ? `${pathname}?${search}` : pathname;
}

export function getReturnTo(value: string | null, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export function buildDetailRoute(pathname: string, returnTo: string) {
  const detail = new URL(pathname, "http://local");
  const source = new URL(returnTo, "http://local");
  if (source.searchParams.get("embed") === "1") detail.searchParams.set("embed", "1");
  detail.searchParams.set("returnTo", returnTo);
  return `${detail.pathname}${detail.search}`;
}

export function buildListRoute(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function useListScrollPosition(storageKey: string, ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const storageKeyWithPrefix = `${LIST_SCROLL_PREFIX}${storageKey}`;
    const stored = window.sessionStorage.getItem(storageKeyWithPrefix);
    const top = Number(stored);
    if (Number.isFinite(top) && top > 0) {
      window.requestAnimationFrame(() => window.scrollTo({ top }));
    }

    const save = () => window.sessionStorage.setItem(storageKeyWithPrefix, String(window.scrollY));
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
    };
  }, [ready, storageKey]);
}
