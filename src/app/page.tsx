import Link from "next/link";
import { HomeDashboardPanel } from "@/components/home-dashboard-panel";
import { navGroups } from "@/lib/modules";

export default function HomePage() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-medium text-[#303133]">欢迎使用算力交付管理系统</h1>
        <p className="mt-2 text-[#909399]">按客户需求、采购、物流、财务链路管理交付业务。</p>
      </div>
      <HomeDashboardPanel />
      <div className="grid grid-cols-5 gap-4">
        {navGroups.map((group) => (
          <div className="border border-[#ebeef5] bg-white p-4 shadow-sm" key={group.title}>
            <div className="mb-3 text-base font-medium text-[#303133]">{group.title}</div>
            <div className="space-y-2">
              {group.children?.length
                ? group.children.map((child) => (
                    <div key={child.title}>
                      <div className="mb-1 mt-3 text-xs font-medium text-[#909399]">{child.title}</div>
                      {child.items.map((item) => (
                        <Link className="block text-[#1890ff] hover:underline" href={item.route} key={item.key}>
                          {item.title}
                        </Link>
                      ))}
                    </div>
                  ))
                : group.items.map((item) => (
                    <Link className="block text-[#1890ff] hover:underline" href={item.route} key={item.key}>
                      {item.title}
                    </Link>
                  ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 border border-[#ebeef5] bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-medium text-[#303133]">第一版功能范围</h2>
        <div className="grid grid-cols-2 gap-4 text-sm leading-7">
          <div>
            <p>客户需求和采购管理采用主从表单。</p>
            <p>需求明细一览、采购明细一览支持跨批次集中查询。</p>
          </div>
          <div>
            <p>物流字段支持显示/隐藏，并展示当前隐藏字段。</p>
            <p>所有模块支持新建、导入模板、批量导入、导出 Excel。</p>
          </div>
        </div>
      </div>
    </>
  );
}
