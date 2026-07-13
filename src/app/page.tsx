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
    </>
  );
}
