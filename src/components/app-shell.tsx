"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ChevronDown,
  Database,
  FileText,
  FolderOpen,
  Home,
  LogOut,
  Menu,
  ReceiptText,
  Ship,
  ShoppingCart,
  Upload,
  X,
} from "lucide-react";
import { navGroups } from "@/lib/modules";
import { getChildGroupKey, isGroupOpen, toggleGroup, type SidebarGroupState } from "@/lib/nav-utils";
import {
  closeWorkspaceTab,
  createInitialWorkspace,
  getEmbeddedRoute,
  openWorkspaceTab,
  type WorkspaceState,
  type WorkspaceTab,
} from "@/lib/tab-workspace";

const WORKSPACE_STORAGE_KEY = "cloud-power-workspace-tabs";

const icons = {
  文档管理: FolderOpen,
  合同管理: ReceiptText,
  基础信息: Database,
  客户需求: FileText,
  采购管理: ShoppingCart,
  物流管理: Ship,
  财务管理: ReceiptText,
  数据工具: Upload,
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<SidebarGroupState>({});
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => createInitialWorkspace());
  const [embedded, setEmbedded] = useState(false);
  const moduleItems = useMemo(() => navGroups.flatMap((group) => group.children?.flatMap((child) => child.items) ?? group.items), []);

  useEffect(() => {
    setEmbedded(isEmbeddedWindow());
  }, []);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  useEffect(() => {
    const raw = window.sessionStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as WorkspaceState;
      if (Array.isArray(parsed.tabs) && parsed.tabs.length && parsed.activeRoute) {
        setWorkspace(parsed);
      }
    } catch {
      window.sessionStorage.removeItem(WORKSPACE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!embedded) {
      window.sessionStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
    }
  }, [embedded, workspace]);

  if (embedded) {
    return <main className="min-h-screen bg-[var(--color-page-bg)] p-5">{children}</main>;
  }

  const openTab = (tab: WorkspaceTab) => {
    setWorkspace((current) => openWorkspaceTab(current, tab));
  };

  const closeTab = (route: string) => {
    setWorkspace((current) => closeWorkspaceTab(current, route));
  };

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[210px] flex-col bg-[var(--color-sidebar)] text-[#bfcbd9]">
        <div className="flex h-[54px] min-w-0 shrink-0 items-center gap-2 px-5 text-white">
          <Boxes className="shrink-0" size={19} />
          <span className="min-w-0 truncate font-medium" title="算力交付">
            算力交付
          </span>
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
          {navGroups.map((group) => {
            const Icon = icons[group.title as keyof typeof icons] ?? Database;
            const open = isGroupOpen(openGroups, group.title);
            return (
              <div key={group.title}>
                <button
                  className="flex h-14 w-full min-w-0 items-center gap-3 bg-[var(--color-sidebar-active)] px-5 text-left hover:text-white"
                  onClick={() => setOpenGroups((current) => toggleGroup(current, group.title))}
                  type="button"
                  title={group.title}
                >
                  <Icon className="shrink-0" size={17} />
                  <span className="min-w-0 flex-1 truncate">{group.title}</span>
                  <ChevronDown className={`shrink-0 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} size={14} />
                </button>
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
          <span className="text-[#909399]">首页</span>
          <span className="mx-2 text-[#c0c4cc]">/</span>
          <span className="text-[#606266]">管理后台</span>
          <div className="ml-auto flex items-center gap-4 text-[#606266]">
            <span>admin</span>
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
                key={tab.route}
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
            .map((tab) => (
              <iframe
                className={tab.route === workspace.activeRoute ? "block h-full w-full border-0" : "hidden"}
                key={tab.route}
                src={getEmbeddedRoute(tab.route)}
                title={tab.title}
              />
            ))}
          {workspace.activeRoute !== "/" && !moduleItems.some((item) => item.route === workspace.activeRoute) ? null : null}
        </section>
      </main>
    </div>
  );
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  window.sessionStorage.removeItem(WORKSPACE_STORAGE_KEY);
  window.location.href = "/login";
}

function isEmbeddedWindow() {
  try {
    return new URLSearchParams(window.location.search).get("embed") === "1" || window.self !== window.top;
  } catch {
    return true;
  }
}

function ChildNavGroup({
  child,
  onOpenTab,
  openGroups,
  parentTitle,
  setOpenGroups,
}: {
  child: { title: string; items: Array<{ key: string; route: string; title: string }> };
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
        ? child.items.map((item) => (
            <button
              className="block h-10 w-full truncate px-10 pr-3 text-left leading-10 hover:text-[#409eff]"
              key={item.key}
              onClick={() => onOpenTab({ route: item.route, title: item.title, closable: true })}
              title={item.title}
              type="button"
            >
              {item.title}
            </button>
          ))
        : null}
    </div>
  );
}
