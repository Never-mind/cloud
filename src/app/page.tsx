import Link from "next/link";
import { cookies } from "next/headers";
import { HomeDashboardPanel } from "@/components/home-dashboard-panel";
import { getAuthenticatedUser } from "@/lib/auth";
import { navGroups, type NavChildGroup } from "@/lib/modules";
import { filterNavGroupsByModuleFeatures } from "@/lib/module-feature-definitions";
import { getModuleFeatureState } from "@/lib/module-feature-service";
import { getPermissionStateForEmail } from "@/lib/permission-service";
import { hasPermission } from "@/lib/permission-definitions";

export const dynamic = "force-dynamic";

function filterChildGroup(child: NavChildGroup, currentUser: Awaited<ReturnType<typeof getAuthenticatedUser>>, permissionState: { role: string; grants: Record<string, number> }): NavChildGroup | null {
  const items = child.items.filter((item) => (!item.adminOnly || currentUser?.role === "admin") && hasPermission(permissionState, item.key, "view"));
  const children = child.children?.map((nested) => filterChildGroup(nested, currentUser, permissionState)).filter((value): value is NavChildGroup => Boolean(value));
  if (!items.length && !children?.length) return null;
  return { ...child, items, children };
}

function renderChildGroups(children: NavChildGroup[]) {
  return children.map((child) => (
    <div key={child.title}>
      <div className="mb-1 mt-3 text-xs font-medium text-[#909399]">{child.title}</div>
      {child.items.map((item) => (
        <Link className="block text-[#1890ff] hover:underline" href={item.route} key={item.key}>
          {item.title}
        </Link>
      ))}
      {child.children?.length ? renderChildGroups(child.children) : null}
    </div>
  ));
}

export default async function HomePage() {
  let enabledNavGroups = navGroups;
  try {
    enabledNavGroups = filterNavGroupsByModuleFeatures(navGroups, await getModuleFeatureState());
  } catch {
    // Keep the page available when the new configuration table has not been initialized yet.
  }
  const currentUser = await getAuthenticatedUser({ cookies: await cookies() } as any);
  let permissionState = { role: currentUser?.role ?? "user", grants: {} };
  if (currentUser) {
    try {
      permissionState = await getPermissionStateForEmail(currentUser.email);
    } catch {
      // Keep the dashboard available while permission tables are being initialized.
    }
  }
  enabledNavGroups = enabledNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => (!item.adminOnly || currentUser?.role === "admin") && hasPermission(permissionState, item.key, "view")),
      children: group.children?.map((child) => filterChildGroup(child, currentUser, permissionState)).filter((value): value is NavChildGroup => Boolean(value)),
    }))
    .filter((group) => group.items.length || group.children?.length);
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-medium text-[#303133]">欢迎使用算力交付管理系统</h1>
        <p className="mt-2 text-[#909399]">按客户需求、采购、物流、财务链路管理交付业务。</p>
      </div>
      <HomeDashboardPanel />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {enabledNavGroups.map((group) => (
          <div className="border border-[#ebeef5] bg-white p-4 shadow-sm" key={group.title}>
            <div className="mb-3 text-base font-medium text-[#303133]">{group.title}</div>
            <div className="space-y-2">
              {group.children?.length
                ? renderChildGroups(group.children)
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
