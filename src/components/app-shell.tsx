"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Boxes,
  ChevronDown,
  Database,
  FileText,
  Home,
  Menu,
  ReceiptText,
  Ship,
  ShoppingCart,
} from "lucide-react";
import { navGroups } from "@/lib/modules";
import { getChildGroupKey, isGroupOpen, toggleGroup, type SidebarGroupState } from "@/lib/nav-utils";

const icons = {
  合同管理: ReceiptText,
  基础信息: Database,
  客户需求: FileText,
  采购管理: ShoppingCart,
  物流管理: Ship,
  财务管理: ReceiptText,
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [openGroups, setOpenGroups] = useState<SidebarGroupState>({});

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[210px] flex-col bg-[var(--color-sidebar)] text-[#bfcbd9]">
        <div className="flex h-[54px] min-w-0 shrink-0 items-center gap-2 px-5 text-white">
          <Boxes className="shrink-0" size={19} />
          <span className="min-w-0 truncate font-medium" title="算力交付">算力交付</span>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4">
          <Link
            className="flex h-14 min-w-0 items-center gap-3 px-5 text-[#409eff]"
            href="/"
          >
            <Home className="shrink-0" size={17} />
            <span className="min-w-0 truncate" title="首页">首页</span>
          </Link>
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
                  <ChevronDown
                    className={`shrink-0 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
                    size={14}
                  />
                </button>
                {open ? (
                  <div className="bg-[var(--color-sidebar-deep)] py-1">
                    {group.children?.length
                      ? group.children.map((child) => (
                          <ChildNavGroup
                            child={child}
                            key={child.title}
                            openGroups={openGroups}
                            parentTitle={group.title}
                            setOpenGroups={setOpenGroups}
                          />
                        ))
                      : group.items.map((item) => (
                          <Link
                            className="block h-10 truncate px-8 pr-3 leading-10 hover:text-[#409eff]"
                            href={item.route}
                            key={item.key}
                            title={item.title}
                          >
                            {item.title}
                          </Link>
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
          </div>
        </header>
        <div className="flex h-[34px] items-center border-b border-[#dcdfe6] bg-white px-4">
          <span className="mr-2 border border-[#dcdfe6] px-3 py-1 text-xs">首页</span>
          <span className="bg-[var(--color-tab-active)] px-3 py-1 text-xs text-white">
            ● 当前页面
          </span>
        </div>
        <section className="p-5">{children}</section>
      </main>
    </div>
  );
}

function ChildNavGroup({
  child,
  openGroups,
  parentTitle,
  setOpenGroups,
}: {
  child: { title: string; items: Array<{ key: string; route: string; title: string }> };
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
        <ChevronDown
          className={`shrink-0 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
          size={12}
        />
      </button>
      {open
        ? child.items.map((item) => (
            <Link
              className="block h-10 truncate px-10 pr-3 leading-10 hover:text-[#409eff]"
              href={item.route}
              key={item.key}
              title={item.title}
            >
              {item.title}
            </Link>
          ))
        : null}
    </div>
  );
}
