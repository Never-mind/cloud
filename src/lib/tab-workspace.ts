import { navGroups, type EntityConfig } from "./modules";

export type WorkspaceTab = {
  id?: string;
  route: string;
  title: string;
  closable: boolean;
};

export type WorkspaceState = {
  tabs: WorkspaceTab[];
  activeRoute: string;
};

export const HOME_TAB: WorkspaceTab = {
  id: "workspace-home",
  route: "/",
  title: "首页",
  closable: false,
};

export type WorkspaceMessage =
  | { type: "cloud-power:route"; route: string; title: string }
  | { type: "cloud-power:open-tab"; route: string; title: string };

function flattenNavItems(groups: typeof navGroups) {
  return groups.flatMap((group) => {
    const flattenChildren = (children: NonNullable<typeof group.children>): EntityConfig[] => children.flatMap((child) => [
      ...child.items,
      ...(child.children ? flattenChildren(child.children) : []),
    ]);
    return [...group.items, ...(group.children ? flattenChildren(group.children) : [])];
  });
}

const workspaceModuleTitles = new Map(flattenNavItems(navGroups).map((item) => [item.route, item.title]));

export function getWorkspaceTabId(tab: WorkspaceTab) {
  return tab.id ?? `workspace-route:${tab.route}`;
}

export function normalizeWorkspaceState(state: WorkspaceState): WorkspaceState {
  const tabsByRoute = new Map<string, WorkspaceTab>();
  for (const tab of state.tabs) {
    if (!tab || !tab.route || tabsByRoute.has(tab.route)) continue;
    tabsByRoute.set(tab.route, { ...tab, id: getWorkspaceTabId(tab) });
  }
  if (!tabsByRoute.has("/")) tabsByRoute.set("/", HOME_TAB);
  const tabs = Array.from(tabsByRoute.values());
  const activeRoute = tabs.some((tab) => tab.route === state.activeRoute) ? state.activeRoute : "/";
  return {
    tabs,
    activeRoute,
  };
}

export function createInitialWorkspace(route = "/", title = "首页"): WorkspaceState {
  if (route === "/") {
    return { tabs: [HOME_TAB], activeRoute: "/" };
  }
  const tab = { id: `workspace-route:${route}`, route, title, closable: true };
  return { tabs: [HOME_TAB, tab], activeRoute: route };
}

export function openWorkspaceTab(state: WorkspaceState, tab: WorkspaceTab): WorkspaceState {
  const existing = state.tabs.find((item) => item.route === tab.route);
  if (existing) {
    return { ...state, activeRoute: existing.route };
  }
  const nextTab = { ...tab, id: tab.id ?? `workspace-route:${tab.route}` };
  return {
    tabs: [...state.tabs, nextTab],
    activeRoute: nextTab.route,
  };
}

export function updateWorkspaceTabRoute(
  state: WorkspaceState,
  tabId: string,
  route: string,
  title: string,
): WorkspaceState {
  const index = state.tabs.findIndex((tab) => getWorkspaceTabId(tab) === tabId);
  if (index < 0) return state;

  const duplicateIndex = state.tabs.findIndex((tab, tabIndex) => tabIndex !== index && tab.route === route);
  const duplicate = duplicateIndex >= 0 ? state.tabs[duplicateIndex] : undefined;
  if (duplicate) {
    // The source iframe is the one that has already been loaded. Keep it as
    // the destination tab so a stale/restored duplicate cannot activate an
    // unloaded iframe and leave the workspace blank.
    const tabs = state.tabs.filter((_, tabIndex) => tabIndex !== duplicateIndex);
    const sourceIndex = tabs.findIndex((tab) => getWorkspaceTabId(tab) === tabId);
    if (sourceIndex < 0) return state;
    tabs[sourceIndex] = { ...tabs[sourceIndex], id: tabId, route, title };
    return {
      ...state,
      activeRoute: duplicate.route,
      tabs,
    };
  }

  const tabs = [...state.tabs];
  tabs[index] = { ...tabs[index], id: tabId, route, title };
  return { tabs, activeRoute: route };
}

export function closeWorkspaceTab(state: WorkspaceState, route: string): WorkspaceState {
  const tabIndex = state.tabs.findIndex((tab) => tab.route === route);
  const tab = state.tabs[tabIndex];
  if (!tab || !tab.closable) return state;

  const nextTabs = state.tabs.filter((item) => item.route !== route);
  if (state.activeRoute !== route) {
    return { ...state, tabs: nextTabs };
  }

  const nextActive = nextTabs[Math.max(0, tabIndex - 1)] ?? HOME_TAB;
  return {
    tabs: nextTabs.length ? nextTabs : [HOME_TAB],
    activeRoute: nextActive.route,
  };
}

export function getEmbeddedRoute(route: string) {
  if (route === "/") return "/";
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}embed=1`;
}

export function getWorkspaceRouteFromLocation(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  params.delete("embed");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function getWorkspaceTabTitle(route: string) {
  const pathname = new URL(route, "http://local").pathname.replace(/\/$/, "") || "/";
  const exactTitles: Record<string, string> = {
    "/": "首页",
    "/finance/prepayment-contracts": "预付款合同",
    "/finance/monthly-prepayment-writeoffs": "预付款每月核销明细",
    "/finance/service-fee-snapshots": "服务费对账单",
    "/finance/service-fee-snapshot-items": "服务费对账单明细",
    "/finance/billing-statements": "月账单对账单",
    "/po/settlement-projects": "项目结算",
  };
  if (exactTitles[pathname]) return exactTitles[pathname];
  const moduleTitle = workspaceModuleTitles.get(pathname);
  if (moduleTitle) return moduleTitle;
  if (/^\/finance\/prepayment-contracts\/[^/]+$/.test(pathname)) return "预付款合同明细";
  if (/^\/finance\/billing-statements\/[^/]+$/.test(pathname)) return "月账单对账单明细";
  if (/^\/product-catalog\/[^/]+$/.test(pathname)) return "产品主档详情";
  if (/^\/suppliers\/[^/]+$/.test(pathname)) return "供应商详情";
  if (/^\/customers\/[^/]+$/.test(pathname)) return "客户详情";
  if (/^\/undertaking-units\/[^/]+$/.test(pathname)) return "承接单位详情";
  if (/^\/requests\/orders\/[^/]+$/.test(pathname)) return "需求单明细";
  if (/^\/purchase\/orders\/[^/]+$/.test(pathname)) return "采购订单明细";
  if (/^\/customer-pos\/[^/]+$/.test(pathname)) return "客户PO明细";
  if (/^\/quotation\/list\/[^/]+$/.test(pathname)) return "报价单明细";
  if (/^\/finance\/billing-adjustments\/[^/]+$/.test(pathname)) return "月账单调整单明细";
  if (/^\/finance\/prepayment-writeoff-adjustments\/[^/]+$/.test(pathname)) return "预付款核销调整单明细";
  if (/^\/finance\/balance-settlements\/[^/]+$/.test(pathname)) return "实例结差明细";
  return "业务明细";
}

export function postWorkspaceMessage(message: WorkspaceMessage) {
  if (typeof window === "undefined") return;
  if (window.parent === window) {
    window.location.assign(message.route);
    return;
  }
  window.parent.postMessage(message, window.location.origin);
}
