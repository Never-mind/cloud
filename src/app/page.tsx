import { HomeDashboardPanel } from "@/components/home-dashboard-panel";

export const dynamic = "force-dynamic";

/**
 * 首页。
 *
 * 这里只放标题和分域总览。原来下方还铺了一整张"所有导航分组 + 链接"的网格，
 * 内容与左侧目录完全重复，而且每个链接都要单独过一遍权限过滤；删除后
 * 导航只保留侧边栏一处，首页专注看数据。
 */
export default function HomePage() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-medium text-ink">欢迎使用 Cloud业务系统</h1>
        <p className="mt-2 text-ink-3">按客户需求、采购、物流、财务链路管理交付业务。</p>
      </div>
      <HomeDashboardPanel />
    </>
  );
}
