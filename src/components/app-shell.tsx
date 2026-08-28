"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Boxes,
  Cloud,
  ChevronDown,
  Database,
  FileText,
  FolderOpen,
  GripVertical,
  Home,
  LogOut,
  Menu,
  ReceiptText,
  RotateCcw,
  Ship,
  ShoppingCart,
  UserCog,
  UsersRound,
  Upload,
  X,
} from "lucide-react";
import { navGroups, type NavChildGroup } from "@/lib/modules";
import {
  filterNavGroupsByModuleFeatures,
  getModuleFeatureKeyForRoute,
  isModuleFeatureEnabled,
  type ModuleFeatureState,
} from "@/lib/module-feature-definitions";
import { getChildGroupKey, isGroupOpen, toggleGroup, type SidebarGroupState } from "@/lib/nav-utils";
import { DEFAULT_SIDEBAR_GROUP_ORDER, getSidebarNavGroups, moveSidebarGroup } from "@/lib/sidebar-navigation";
import {
  closeWorkspaceTab,
  createInitialWorkspace,
  getEmbeddedRoute,
  getWorkspaceRouteFromLocation,
  getWorkspaceTabId,
  getWorkspaceTabTitle,
  normalizeWorkspaceState,
  openWorkspaceTab,
  updateWorkspaceTabRoute,
  type WorkspaceState,
  type WorkspaceTab,
} from "@/lib/tab-workspace";
import { hasPermission, type PermissionState } from "@/lib/permission-definitions";

const WORKSPACE_STORAGE_KEY = "cloud-power-workspace-tabs";

const icons = {
  公共区域: FolderOpen,
  文档管理: FolderOpen,
  合同管理: ReceiptText,
  基础信息: Database,
  客户需求: FileText,
  采购管理: ShoppingCart,
  物流管理: Ship,
  财务管理: ReceiptText,
  数据工具: Upload,
  客户PO: ShoppingCart,
  算力系统: Boxes,
  集采系统: ShoppingCart,
  华为云业务: Cloud,
  业务伙伴: UsersRound,
  用户管理: UserCog,
};

export function AppShell({
  children,
  embedded,
  isAdmin,
  currentUserName,
  initialModuleFeatureState,
  initialPermissionState,
}: {
  children: React.ReactNode;
  embedded: boolean;
  isAdmin: boolean;
  currentUserName: string;
  initialModuleFeatureState: ModuleFeatureState;
  initialPermissionState: PermissionState;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [openGroups, setOpenGroups] = useState<SidebarGroupState>({});
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => createInitialWorkspace());
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [sidebarGroupOrder, setSidebarGroupOrder] = useState<string[]>([...DEFAULT_SIDEBAR_GROUP_ORDER]);
  const [draggingGroupTitle, setDraggingGroupTitle] = useState<string | null>(null);
  const [moduleFeatureState, setModuleFeatureState] = useState<ModuleFeatureState>(() => initialModuleFeatureState);
  const [permissionState] = useState<PermissionState>(() => initialPermissionState);
  const filteredNavGroups = useMemo(
    () => filterNavGroupsByModuleFeatures(navGroups, moduleFeatureState),
    [moduleFeatureState],
  );
  const visibleNavGroups = useMemo(() => {
    const filterChild = (child: NavChildGroup): NavChildGroup | null => {
      const items = child.items.filter((item) => (!item.adminOnly || isAdmin) && hasPermission(permissionState, item.key, "view"));
      const children = child.children?.map(filterChild).filter((value): value is NavChildGroup => Boolean(value));
      if (!items.length && !children?.length) return null;
      return { ...child, items, children };
    };
    return filteredNavGroups.map((group) => ({
      ...group,
      items: group.items.filter((item) => (!item.adminOnly || isAdmin) && hasPermission(permissionState, item.key, "view")),
      children: group.children?.map(filterChild).filter((value): value is NavChildGroup => Boolean(value)),
    })).filter((group) => group.items.length || group.children?.length);
  }, [filteredNavGroups, isAdmin, permissionState]);
  const sidebarGroups = useMemo(() => getSidebarNavGroups(visibleNavGroups, sidebarGroupOrder), [sidebarGroupOrder, visibleNavGroups]);
  const currentSectionTitle = getTopLevelTitle(pathname);
  const isEmbedded = embedded;

  useEffect(() => {
    if (isEmbedded || pathname === "/login") return;
    let active = true;
    void fetch("/api/user-preferences/sidebar-order")
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.order) setSidebarGroupOrder(data.order);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isEmbedded, pathname]);

  useEffect(() => {
    if (isEmbedded || pathname === "/login") return;
    let active = true;
    void fetch("/api/system/module-features", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.state && typeof data.state === "object") setModuleFeatureState(data.state as ModuleFeatureState);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [isEmbedded, pathname]);

  useEffect(() => {
    if (isEmbedded) {
      setWorkspaceReady(true);
      return;
    }
    const raw = window.sessionStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as WorkspaceState;
        if (Array.isArray(parsed.tabs) && parsed.tabs.length && parsed.activeRoute) {
          setWorkspace(normalizeWorkspaceState(parsed));
        }
      } catch {
        window.sessionStorage.removeItem(WORKSPACE_STORAGE_KEY);
      }
    }
    setWorkspaceReady(true);
  }, [isEmbedded]);

  useEffect(() => {
    if (!isEmbedded && workspaceReady) {
      window.sessionStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
    }
  }, [isEmbedded, workspaceReady, workspace]);

  useEffect(() => {
    if (!isEmbedded) return;
    const route = getWorkspaceRouteFromLocation(pathname, window.location.search);
    window.parent.postMessage(
      { type: "cloud-power:route", route, title: getWorkspaceTabTitle(route) },
      window.location.origin,
    );
  }, [isEmbedded, pathname, searchParams]);

  useEffect(() => {
    if (isEmbedded) return;

    function handleWorkspaceMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source === window) return;
      const message = event.data as { type?: string; route?: string; title?: string } | null;
      if (message?.type === "cloud-power:module-features-updated") {
        void fetch("/api/system/module-features", { cache: "no-store" })
          .then(async (response) => (response.ok ? response.json() : null))
          .then((data) => {
            if (data?.state && typeof data.state === "object") setModuleFeatureState(data.state as ModuleFeatureState);
          })
          .catch(() => undefined);
        return;
      }
      if (!message?.route || !message.title) return;
      const frame = Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe[data-workspace-tab-id]"))
        .find((candidate) => candidate.contentWindow === event.source);
      if (!frame) return;

      const route = getWorkspaceRouteFromLocation(new URL(message.route, window.location.origin).pathname, new URL(message.route, window.location.origin).search);
      const title = message.title || getWorkspaceTabTitle(route);
      if (message.type === "cloud-power:open-tab") {
        setWorkspace((current) => openWorkspaceTab(current, { route, title, closable: true }));
        return;
      }
      if (message.type === "cloud-power:route") {
        const tabId = frame.dataset.workspaceTabId;
        if (tabId) setWorkspace((current) => updateWorkspaceTabRoute(current, tabId, route, title));
      }
    }

    window.addEventListener("message", handleWorkspaceMessage);
    return () => window.removeEventListener("message", handleWorkspaceMessage);
  }, [isEmbedded]);

  useEffect(() => {
    if (isEmbedded || workspace.activeRoute === "/") return;
    const moduleKey = getModuleFeatureKeyForRoute(workspace.activeRoute);
    if (moduleKey && !isModuleFeatureEnabled(moduleKey, moduleFeatureState)) {
      setWorkspace((current) => ({
        ...current,
        tabs: current.tabs.filter((tab) => tab.route === "/" || isModuleFeatureEnabled(getModuleFeatureKeyForRoute(tab.route) ?? "", moduleFeatureState)),
        activeRoute: "/",
      }));
    }
  }, [isEmbedded, moduleFeatureState, workspace.activeRoute]);

  const currentModuleKey = getModuleFeatureKeyForRoute(pathname);
  if (pathname === "/login") return <>{children}</>;

  if (isEmbedded) {
    if (currentModuleKey && !isModuleFeatureEnabled(currentModuleKey, moduleFeatureState)) {
      return <main className="min-h-screen bg-[var(--color-page-bg)] p-5" data-app-shell="inner"><div className="border border-[#ebeef5] bg-white p-6"><h1 className="text-lg font-medium text-[#303133]">功能模块暂未启用</h1><p className="mt-2 text-sm text-[#606266]">请联系管理员在“功能模块管理”中启用该功能。</p></div></main>;
    }
    return <main className="min-h-screen bg-[var(--color-page-bg)] p-5" data-app-shell="inner">{children}</main>;
  }

  if (!workspaceReady) {
    return <main className="min-h-screen bg-[var(--color-page-bg)]" data-app-shell="outer" />;
  }

  const openTab = (tab: WorkspaceTab) => {
    setWorkspace((current) => openWorkspaceTab(current, tab));
  };

  const closeTab = (route: string) => {
    setWorkspace((current) => closeWorkspaceTab(current, route));
  };

  const saveSidebarOrder = async (order: string[]) => {
    const response = await fetch("/api/user-preferences/sidebar-order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.error ?? "目录排序保存失败，请重新登录后再试");
    }
  };

  const reorderSidebarGroups = (sourceTitle: string, targetTitle: string) => {
    const nextOrder = moveSidebarGroup(sidebarGroupOrder, sourceTitle, targetTitle);
    setDraggingGroupTitle(null);
    setSidebarGroupOrder(nextOrder);
    void saveSidebarOrder(nextOrder);
  };

  const resetSidebarOrder = () => {
    const nextOrder = [...DEFAULT_SIDEBAR_GROUP_ORDER];
    setSidebarGroupOrder(nextOrder);
    void saveSidebarOrder(nextOrder);
  };

  return (
    <div className="min-h-screen" data-app-shell="outer">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[210px] flex-col bg-[var(--color-sidebar)] text-[#bfcbd9]">
        <div className="flex h-[54px] min-w-0 shrink-0 items-center gap-2 px-5 text-white">
          <Boxes className="shrink-0" size={19} />
          <span className="min-w-0 truncate font-medium" title="业务系统">
            业务系统
          </span>
          <button
            className="ml-auto shrink-0 text-[#bfcbd9] hover:text-white"
            onClick={resetSidebarOrder}
            title="恢复默认目录顺序"
            type="button"
          >
            <RotateCcw size={15} />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4">
          <button
            className="flex h-14 w-full min-w-0 items-center gap-3 px-5 text-left text-[#409eff]"
            onClick={() => openTab({ route: "/", title: "首页", closable: false })}
            type="button"
          >
            <Home className="shrink-0" size={17} />
            <span className="min-w-0 truncate" title="首页">
              首页
            </span>
          </button>
          {sidebarGroups.map((group) => {
            const Icon = icons[group.title as keyof typeof icons] ?? Database;
            const open = isGroupOpen(openGroups, group.title);
            return (
              <div
                key={group.title}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceTitle = event.dataTransfer.getData("text/plain");
                  if (sourceTitle) reorderSidebarGroups(sourceTitle, group.title);
                }}
              >
                <div className={`flex h-14 min-w-0 items-center bg-[var(--color-sidebar-active)] ${draggingGroupTitle === group.title ? "opacity-60" : ""}`}>
                  <button
                    aria-label={`拖动调整${group.title}顺序`}
                    className="flex h-full shrink-0 cursor-grab items-center px-2 text-[#8aa0b8] hover:text-white active:cursor-grabbing"
                    draggable
                    onDragEnd={() => setDraggingGroupTitle(null)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", group.title);
                      setDraggingGroupTitle(group.title);
                    }}
                    title="拖动调整目录顺序"
                    type="button"
                  >
                    <GripVertical size={15} />
                  </button>
                  <button
                    className="flex h-full min-w-0 flex-1 items-center gap-3 pr-5 text-left hover:text-white"
                    onClick={() => setOpenGroups((current) => toggleGroup(current, group.title))}
                    type="button"
                    title={group.title}
                  >
                    <Icon className="shrink-0" size={17} />
                    <span className="min-w-0 flex-1 truncate">{group.title}</span>
                    <ChevronDown className={`shrink-0 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} size={14} />
                  </button>
                </div>
                {open ? (
                  <div className="bg-[var(--color-sidebar-deep)] py-1">
                    {group.children?.length
                      ? group.children.map((child) => (
                          <ChildNavGroup
                            child={child}
                            key={child.title}
                            onOpenTab={openTab}
                            openGroups={openGroups}
                            parentTitle={group.title}
                            setOpenGroups={setOpenGroups}
                          />
                        ))
                      : group.items.map((item) => (
                          <button
                            className="block h-10 w-full truncate px-8 pr-3 text-left leading-10 hover:text-[#409eff]"
                            key={item.key}
                            onClick={() => openTab({ route: item.route, title: item.title, closable: true })}
                            title={item.title}
                            type="button"
                          >
                            {item.title}
                          </button>
                        ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </aside>
      <main className="ml-[210px] min-h-screen">
        <header className="sticky top-0 z-10 flex h-[50px] items-center border-b border-[#e5e7eb] bg-white px-4">
          <Menu size={19} className="mr-5 text-[#303133]" />
          <span className="text-[#909399]">{currentSectionTitle}</span>
          <span className="mx-2 text-[#c0c4cc]">/</span>
          <span className="text-[#606266]">管理后台</span>
          <div className="ml-auto flex items-center gap-4 text-[#606266]">
            <span>{currentUserName || "用户"}</span>
            <div className="h-8 w-8 rounded bg-[#eef1f5]" />
            <button
              className="inline-flex h-8 items-center gap-1 rounded border border-[#dcdfe6] px-2 text-xs hover:border-[#1890ff] hover:text-[#1890ff]"
              onClick={logout}
              type="button"
            >
              <LogOut size={14} />
              退出
            </button>
          </div>
        </header>
        <div className="flex h-[38px] items-center gap-1 overflow-x-auto border-b border-[#dcdfe6] bg-white px-3">
          {workspace.tabs.map((tab) => {
            const active = tab.route === workspace.activeRoute;
            return (
              <div
                className={`flex h-7 max-w-[190px] shrink-0 items-center border px-3 text-xs ${
                  active ? "border-[var(--color-tab-active)] bg-[var(--color-tab-active)] text-white" : "border-[#dcdfe6] bg-white text-[#606266]"
                }`}
                key={getWorkspaceTabId(tab)}
              >
                <button
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => setWorkspace((current) => ({ ...current, activeRoute: tab.route }))}
                  title={tab.title}
                  type="button"
                >
                  {tab.title}
                </button>
                {tab.closable ? (
                  <button
                    className={`ml-2 shrink-0 ${active ? "text-white" : "text-[#909399] hover:text-[#f56c6c]"}`}
                    onClick={() => closeTab(tab.route)}
                    title="关闭"
                    type="button"
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        <section className="relative h-[calc(100vh-88px)] overflow-hidden">
          <div className={workspace.activeRoute === "/" ? "h-full overflow-auto p-5" : "hidden"}>{children}</div>
          {workspace.tabs
            .filter((tab) => tab.route !== "/")
            .map((tab) => {
              const tabId = getWorkspaceTabId(tab);
              return (
                <iframe
                  className={tab.route === workspace.activeRoute ? "block h-full w-full border-0" : "hidden"}
                  data-workspace-tab-id={tabId}
                  key={tabId}
                  src={getEmbeddedRoute(tab.route)}
                  title={tab.title}
                />
              );
            })}
        </section>
      </main>
    </div>
  );
}

function getTopLevelTitle(pathname: string) {
  if (pathname.startsWith("/suppliers") || pathname.startsWith("/customers") || pathname.startsWith("/undertaking-units")) return "业务伙伴";
  if (pathname.startsWith("/system/users") || pathname.startsWith("/system/module-features")) return "用户管理";
  if (pathname.startsWith("/cloud")) return "华为云业务";
  if (pathname.startsWith("/customer-pos") || pathname.startsWith("/quotation") || pathname.startsWith("/history-quotations") || pathname.startsWith("/product-catalog") || pathname.startsWith("/tariff-rates") || pathname.startsWith("/customer-product-aliases") || pathname.startsWith("/po/")) return "集采系统";
  return "算力系统";
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  window.sessionStorage.removeItem(WORKSPACE_STORAGE_KEY);
  window.location.href = "/login";
}

function ChildNavGroup({
  child,
  onOpenTab,
  openGroups,
  parentTitle,
  setOpenGroups,
}: {
  child: NavChildGroup;
  onOpenTab: (tab: WorkspaceTab) => void;
  openGroups: SidebarGroupState;
  parentTitle: string;
  setOpenGroups: React.Dispatch<React.SetStateAction<SidebarGroupState>>;
}) {
  const childKey = getChildGroupKey(parentTitle, child.title);
  const open = isGroupOpen(openGroups, childKey);

  return (
    <div>
      <button
        className="flex h-9 w-full min-w-0 items-center gap-2 px-8 text-left text-xs font-medium text-[#8aa0b8] hover:text-white"
        onClick={() => setOpenGroups((current) => toggleGroup(current, childKey))}
        title={child.title}
        type="button"
      >
        <span className="min-w-0 flex-1 truncate">{child.title}</span>
        <ChevronDown className={`shrink-0 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} size={12} />
      </button>
      {open
        ? <>
            {child.children?.map((nested) => (
              <ChildNavGroup
                child={nested}
                key={nested.title}
                onOpenTab={onOpenTab}
                openGroups={openGroups}
                parentTitle={childKey}
                setOpenGroups={setOpenGroups}
              />
            ))}
            {child.items.map((item) => (
              <button
                className="block h-10 w-full truncate px-10 pr-3 text-left leading-10 hover:text-[#409eff]"
                key={item.key}
                onClick={() => onOpenTab({ route: item.route, title: item.title, closable: true })}
                title={item.title}
                type="button"
              >
                {item.title}
              </button>
            ))}
          </>
        : null}
    </div>
  );
}
