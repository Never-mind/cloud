import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getAuthenticatedUser, isAuthenticatedCookie } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-session";
import {
  decodeModuleFeatureState,
  MODULE_FEATURE_COOKIE_NAME,
} from "@/lib/module-feature-definitions";
import {
  EMBEDDED_COOKIE_NAME,
  EMBEDDED_REQUEST_HEADER,
} from "@/lib/embedded-workspace";
import { getPermissionStateForEmail } from "@/lib/permission-service";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cloud业务系统",
  description: "客户需求、采购、物流、财务一体化后台",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const embedded = requestHeaders.get(EMBEDDED_REQUEST_HEADER) === "1"
    || cookieStore.get(EMBEDDED_COOKIE_NAME)?.value === "1";
  const initialModuleFeatureState = decodeModuleFeatureState(
    cookieStore.get(MODULE_FEATURE_COOKIE_NAME)?.value,
  );
  const currentUser = await getAuthenticatedUser({ cookies: cookieStore } as any);
  /**
   * 会话自愈：会话 cookie 还在，但账号已经查不到（被删除/改了邮箱）或已停用，
   * 说明是失效会话。这时必须清 cookie 回登录页 —— 否则页面会以"空权限"渲染，
   * 用户看到的现象就是"登录后只剩首页、左侧目录全没了"。
   */
  if (isAuthenticatedCookie(cookieStore.get(AUTH_COOKIE_NAME)?.value) && (!currentUser || currentUser.status !== "active")) {
    redirect("/api/auth/logout?next=%2Flogin");
  }
  let initialPermissionState = { role: currentUser?.role ?? "user", grants: {} };
  if (currentUser) {
    try {
      initialPermissionState = await getPermissionStateForEmail(currentUser.email);
    } catch {
      // Keep pages renderable before the permission tables are initialized.
    }
  }

  return (
    <html data-embedded-page={embedded ? "1" : undefined} lang="zh-CN" suppressHydrationWarning>
      <body>
        <AppShell embedded={embedded} isAdmin={currentUser?.role === "admin"} currentUserName={currentUser?.displayName ?? ""} initialModuleFeatureState={initialModuleFeatureState} initialPermissionState={initialPermissionState}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
