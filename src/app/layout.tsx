import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { getAuthenticatedUser } from "@/lib/auth";
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
  title: "算力交付管理系统",
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
  let initialPermissionState = { role: currentUser?.role ?? "user", grants: {} };
  if (currentUser) {
    try {
      initialPermissionState = await getPermissionStateForEmail(currentUser.email);
    } catch {
      // Keep pages renderable before the permission tables are initialized.
    }
  }

  return (
    <html data-embedded-page={embedded ? "1" : undefined} lang="zh-CN">
      <body>
        <AppShell embedded={embedded} isAdmin={currentUser?.role === "admin"} currentUserName={currentUser?.displayName ?? ""} initialModuleFeatureState={initialModuleFeatureState} initialPermissionState={initialPermissionState}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
