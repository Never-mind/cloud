import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import {
  decodeModuleFeatureState,
  MODULE_FEATURE_COOKIE_NAME,
} from "@/lib/module-feature-definitions";
import "./globals.css";

export const metadata: Metadata = {
  title: "算力交付管理系统",
  description: "客户需求、采购、物流、财务一体化后台",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const embedded = cookieStore.get("cloud-power-embedded")?.value === "1";
  const initialModuleFeatureState = decodeModuleFeatureState(
    cookieStore.get(MODULE_FEATURE_COOKIE_NAME)?.value,
  );

  return (
    <html data-embedded-page={embedded ? "1" : undefined} lang="zh-CN">
      <body>
        <AppShell embedded={embedded} initialModuleFeatureState={initialModuleFeatureState}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
