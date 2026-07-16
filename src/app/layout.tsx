import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "算力交付管理系统",
  description: "客户需求、采购、物流、财务一体化后台",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const embedded = (await cookies()).get("cloud-power-embedded")?.value === "1";

  return (
    <html lang="zh-CN">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "if (location.search.indexOf('embed=1') !== -1) document.documentElement.setAttribute('data-embedded-page', '1');",
          }}
        />
      </head>
      <body>
        <AppShell embedded={embedded}>{children}</AppShell>
      </body>
    </html>
  );
}
