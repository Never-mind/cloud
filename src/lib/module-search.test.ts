import { describe, expect, it } from "vitest";
import { buildModuleSearchIndex, searchModules, type ModuleSearchEntry } from "./module-search";
import { navGroups } from "./modules";
import { filterNavGroupsByModuleFeatures } from "./module-feature-definitions";
import { getDefaultModuleFeatureState } from "./module-feature-definitions";

// 与侧边栏一致：先按功能开关过滤，再建索引，所以停用的功能搜不到。
const entries = buildModuleSearchIndex(
  filterNavGroupsByModuleFeatures(navGroups as never, getDefaultModuleFeatureState()) as never,
);

function titles(query: string) {
  return searchModules(query, entries).map((hit) => hit.title);
}

describe("功能模块搜索", () => {
  it("从真实导航树里摊平出模块，且每个模块只出现一次", () => {
    expect(entries.length).toBeGreaterThan(30);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length);
    expect(entries.every((entry) => entry.route.startsWith("/"))).toBe(true);
  });

  it("按中文名搜索", () => {
    expect(titles("月账")).toEqual(expect.arrayContaining(["月账单合同", "月账单每月明细", "月账单对账单", "待生成月账单实例"]));
  });

  it("按拼音首字母搜索", () => {
    expect(titles("yzd")).toContain("月账单合同");
    expect(titles("yzdht")).toContain("月账单合同");
    expect(titles("fphz")).toEqual(["发票汇总"]);
    expect(titles("wllb")).toEqual(["物流列表"]);
  });

  it("改名后旧叫法仍能搜到（台账是别名）", () => {
    expect(titles("台账")).toContain("月账单合同");
  });

  it("按业务别名搜索", () => {
    expect(titles("交单")).toEqual(["物流列表"]);
    expect(titles("开票")).toEqual(["发票汇总"]);
    // 结差系列里有若干模块默认停用，过滤后可能只剩别名同样命中"结差"的项目结算。
    expect(titles("结差")).toContain("项目结算");
    expect(titles("核销")).toEqual(expect.arrayContaining(["预付款每月核销明细", "预付款核销调整单"]));
  });

  it("完全匹配排在包含匹配前面", () => {
    const hits = searchModules("月账单合同", entries);
    expect(hits[0].title).toBe("月账单合同");
    expect(hits[0].score).toBe(100);
  });

  it("搜不到时返回空数组", () => {
    expect(titles("zzz")).toEqual([]);
    expect(titles("不存在的功能")).toEqual([]);
  });

  it("空关键词返回全部模块", () => {
    expect(titles("").length).toBe(entries.length);
    expect(titles("   ").length).toBe(entries.length);
  });

  it("停用的功能不在索引里（索引来自已过滤的导航树）", () => {
    // 内部服务费系列当前是停用状态，不应出现在可搜索模块中。
    expect(entries.some((entry) => entry.key.startsWith("internal-service-fee"))).toBe(false);
    expect(titles("内部服务费")).toEqual([]);
  });

  it("结果带上所属域与分组，便于分组显示", () => {
    const hit = searchModules("月账单合同", entries)[0];
    expect(hit.domain).toBeTruthy();
    expect(hit.group).toBe("月账单管理");
  });

  it("无别名/无拼音的模块不会报错，只是匹配不到拼音和别名", () => {
    const custom: ModuleSearchEntry[] = [
      { key: "x", title: "某某自定义模块", route: "/x", description: "", domain: "测试", group: "测试" },
    ];
    expect(searchModules("某某", custom)).toHaveLength(1);
    expect(searchModules("mmzdy", custom)).toHaveLength(0);
  });
});
