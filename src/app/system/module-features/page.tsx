import { cookies } from "next/headers";
import { ModuleFeaturesPage } from "@/components/module-features-page";
import { getAuthenticatedUser } from "@/lib/auth";
import { Panel } from "@/components/ui";

export default async function Page() {
  const currentUser = await getAuthenticatedUser({ cookies: await cookies() } as any);
  if (currentUser?.role !== "admin") {
    return <Panel className="p-6 text-sm text-[#909399]">仅管理员可访问。</Panel>;
  }
  return <ModuleFeaturesPage />;
}
