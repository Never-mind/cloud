import { describe, expect, it } from "vitest";
import { DEFAULT_SIDEBAR_GROUP_ORDER, getSidebarNavGroups, moveSidebarGroup, normalizeSidebarGroupOrder } from "./sidebar-navigation";

describe("sidebar navigation preferences", () => {
  it("uses the requested default sidebar group order", () => {
    expect(DEFAULT_SIDEBAR_GROUP_ORDER).toEqual([
      "客户需求",
      "采购管理",
      "物流管理",
      "财务管理",
      "合同管理",
      "基础信息",
      "文档管理",
      "数据工具",
    ]);
  });

  it("rejects an incomplete or unknown saved order", () => {
    expect(normalizeSidebarGroupOrder(["客户需求"])).toEqual([...DEFAULT_SIDEBAR_GROUP_ORDER]);
    expect(normalizeSidebarGroupOrder(["客户需求", "未知目录"])).toEqual([...DEFAULT_SIDEBAR_GROUP_ORDER]);
  });

  it("moves a group while keeping all other groups", () => {
    expect(moveSidebarGroup([...DEFAULT_SIDEBAR_GROUP_ORDER], "数据工具", "客户需求")).toEqual([
      "数据工具",
      "客户需求",
      "采购管理",
      "物流管理",
      "财务管理",
      "合同管理",
      "基础信息",
      "文档管理",
    ]);
  });

  it("only returns groups available in the sidebar", () => {
    const groups = getSidebarNavGroups(
      [
        { title: "财务管理", items: [] },
        { title: "客户需求", items: [] },
        { title: "采购管理", items: [] },
      ],
      [...DEFAULT_SIDEBAR_GROUP_ORDER],
    );
    expect(groups.map((group) => group.title)).toEqual(["客户需求", "采购管理", "财务管理"]);
  });
});
