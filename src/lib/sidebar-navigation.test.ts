import { describe, expect, it } from "vitest";
import { attachSharedChildrenToBusinessDomains, DEFAULT_SIDEBAR_GROUP_ORDER, getSidebarNavGroups, moveSidebarGroup, normalizeSidebarGroupOrder } from "./sidebar-navigation";

describe("sidebar navigation preferences", () => {
  it("uses the requested default sidebar group order", () => {
    expect(DEFAULT_SIDEBAR_GROUP_ORDER).toEqual([
      "算力系统",
      "集采系统",
      "华为云业务",
      "业务伙伴",
      "用户管理",
    ]);
  });

  it("rejects an incomplete or unknown saved order", () => {
    expect(normalizeSidebarGroupOrder(["客户需求"])).toEqual([...DEFAULT_SIDEBAR_GROUP_ORDER]);
    expect(normalizeSidebarGroupOrder(["客户需求", "未知目录"])).toEqual([...DEFAULT_SIDEBAR_GROUP_ORDER]);
  });

  it("moves a group while keeping all other groups", () => {
    expect(moveSidebarGroup([...DEFAULT_SIDEBAR_GROUP_ORDER], "华为云业务", "算力系统")).toEqual([
      "华为云业务",
      "算力系统",
      "集采系统",
      "业务伙伴",
      "用户管理",
    ]);
  });

  it("only returns groups available in the sidebar", () => {
    const groups = getSidebarNavGroups(
      [
        { title: "华为云业务", items: [] },
        { title: "算力系统", items: [] },
        { title: "集采系统", items: [] },
        { title: "业务伙伴", items: [] },
        { title: "用户管理", items: [] },
      ],
      [...DEFAULT_SIDEBAR_GROUP_ORDER],
    );
    expect(groups.map((group) => group.title)).toEqual(["算力系统", "集采系统", "华为云业务", "业务伙伴", "用户管理"]);
  });

    it("keeps all top-level directories draggable with the shared order", () => {
      const next = moveSidebarGroup(
        [...DEFAULT_SIDEBAR_GROUP_ORDER],
        "集采系统",
        "算力系统",
      );
      expect(next).toEqual([
      "集采系统",
      "算力系统",
      "华为云业务",
      "业务伙伴",
      "用户管理",
      ]);
  });

  it("does not inject shared records into business domains", () => {
    const groups = attachSharedChildrenToBusinessDomains([
      { title: "算力系统", items: [], children: [{ title: "客户需求", items: [] }] },
      { title: "集采系统", items: [], children: [{ title: "客户PO", items: [] }] },
      { title: "华为云业务", items: [], children: [{ title: "华为云业务", items: [] }] },
      { title: "业务伙伴", items: [], children: [{ title: "客户管理", items: [] }] },
    ]);
    expect(groups.map((group) => group.title)).toEqual(["算力系统", "集采系统", "华为云业务", "业务伙伴"]);
    expect(groups.find((group) => group.title === "业务伙伴")?.children?.map((child) => child.title)).toEqual(["客户管理"]);
  });
});
