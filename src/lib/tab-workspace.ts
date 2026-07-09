export type WorkspaceTab = {
  route: string;
  title: string;
  closable: boolean;
};

export type WorkspaceState = {
  tabs: WorkspaceTab[];
  activeRoute: string;
};

export const HOME_TAB: WorkspaceTab = {
  route: "/",
  title: "首页",
  closable: false,
};

export function createInitialWorkspace(route = "/", title = "首页"): WorkspaceState {
  if (route === "/") {
    return { tabs: [HOME_TAB], activeRoute: "/" };
  }
  const tab = { route, title, closable: true };
  return { tabs: [HOME_TAB, tab], activeRoute: route };
}

export function openWorkspaceTab(state: WorkspaceState, tab: WorkspaceTab): WorkspaceState {
  const existing = state.tabs.find((item) => item.route === tab.route);
  if (existing) {
    return { ...state, activeRoute: existing.route };
  }
  return {
    tabs: [...state.tabs, tab],
    activeRoute: tab.route,
  };
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
