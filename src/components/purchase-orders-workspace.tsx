"use client";

/**
 * 采购订单页的外层标签壳：
 *   [待采购明细] 勾选需求明细组成采购订单
 *   [采购订单]   现有的采购清单列表（草稿/已确认原样保留）
 *
 * 标签记在 URL（?tab=pending），刷新、分享链接、从需求单跳转都不丢。
 */
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OrderListPage } from "./order-list-page";
import { PendingPurchaseItemsPage } from "./pending-purchase-items-page";
import type { EntityConfig } from "@/lib/modules";

export function PurchaseOrdersWorkspace({
  detailConfig,
  masterConfig,
}: {
  detailConfig: EntityConfig;
  masterConfig: EntityConfig;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "pending" ? "pending" : "orders";
  const [tab, setTab] = useState<"pending" | "orders">(initialTab);
  const [pendingCount, setPendingCount] = useState(0);

  const loadCount = useCallback(async () => {
    try {
      const response = await fetch("/api/procurement/pending-items?count=1", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setPendingCount(Number(data.total ?? 0));
    } catch {
      // 角标读不到不影响使用
    }
  }, []);

  useEffect(() => {
    void loadCount();
  }, [loadCount, tab]);

  function switchTab(next: "pending" | "orders") {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "pending") params.set("tab", "pending");
    else {
      params.delete("tab");
      params.delete("requestNo");
    }
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }

  const tabClass = (active: boolean) => `-mb-px border-b-2 px-4 py-3 text-sm ${active ? "border-primary text-primary" : "border-transparent text-ink-2 hover:text-primary"}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-line">
        <button className={tabClass(tab === "pending")} onClick={() => switchTab("pending")} type="button">
          待采购明细
          {pendingCount > 0 ? (
            <span className="ml-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium leading-none text-white">{pendingCount > 99 ? "99+" : pendingCount}</span>
          ) : null}
        </button>
        <button className={tabClass(tab === "orders")} onClick={() => switchTab("orders")} type="button">采购订单</button>
      </div>

      {tab === "pending" ? (
        <PendingPurchaseItemsPage
          initialRequestNo={searchParams.get("requestNo") ?? ""}
          onCountChange={setPendingCount}
          onCreated={() => { void loadCount(); switchTab("orders"); }}
        />
      ) : (
        <OrderListPage detailConfig={detailConfig} hideHeading masterConfig={masterConfig} mode="purchase" relationKey="purchaseOrderId" />
      )}
    </div>
  );
}
