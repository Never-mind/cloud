import type { NavGroup } from "./modules";

export const DEFAULT_SIDEBAR_GROUP_ORDER = [
  "算力系统",
  "集采系统",
  "华为云业务",
  "业务伙伴",
  "用户管理",
] as const;

const DEFAULT_ORDER_SET = new Set<string>(DEFAULT_SIDEBAR_GROUP_ORDER);

/**
 * Kept as a no-op for callers from the earlier domain-switching layout.
 * Shared records now have their own top-level business-partner directory.
 */
export function attachSharedChildrenToBusinessDomains(groups: NavGroup[]): NavGroup[] {
  return groups;
}

export function normalizeSidebarGroupOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_SIDEBAR_GROUP_ORDER];
  const titles = value.filter((item): item is string => typeof item === "string");
  if (titles.length !== DEFAULT_SIDEBAR_GROUP_ORDER.length) return [...DEFAULT_SIDEBAR_GROUP_ORDER];
  if (new Set(titles).size !== titles.length || titles.some((title) => !DEFAULT_ORDER_SET.has(title))) {
    return [...DEFAULT_SIDEBAR_GROUP_ORDER];
  }
  return titles;
}

export function getSidebarNavGroups(groups: NavGroup[], order: unknown): NavGroup[] {
  const groupByTitle = new Map(groups.map((group) => [group.title, group]));
  return normalizeSidebarGroupOrder(order)
    .map((title) => groupByTitle.get(title))
    .filter((group): group is NavGroup => Boolean(group));
}

export function moveSidebarGroup(order: string[], sourceTitle: string, targetTitle: string): string[] {
  if (sourceTitle === targetTitle) return normalizeSidebarGroupOrder(order);
  const normalized = normalizeSidebarGroupOrder(order);
  const sourceIndex = normalized.indexOf(sourceTitle);
  const targetIndex = normalized.indexOf(targetTitle);
  if (sourceIndex < 0 || targetIndex < 0) return normalized;

  const next = [...normalized];
  next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceTitle);
  return next;
}
