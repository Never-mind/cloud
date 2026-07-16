"use client";

import { useMemo, useState } from "react";
import { EntityPage } from "./entity-page";
import { Button, Panel } from "./ui";
import { getEntityConfig } from "@/lib/modules";

export function PurchaseOrderDemandPlanTabs({
  purchaseOrderId,
  poNo,
}: {
  purchaseOrderId: string;
  poNo: string;
}) {
  const [activeTab, setActiveTab] = useState<"sn" | "plan">("sn");
  const fixedFilters = useMemo(() => ({ purchaseOrderId }), [purchaseOrderId]);
  const fixedValues = useMemo(() => ({ purchaseOrderId, poNo }), [poNo, purchaseOrderId]);
  const config = getEntityConfig(activeTab === "sn" ? "purchase-order-sn-items" : "purchase-order-plan-items");

  if (!config) return null;

  return (
    <Panel>
      <div className="flex gap-2 border-b border-[#ebeef5] px-4 pt-3">
        <Button tone={activeTab === "sn" ? "primary" : "default"} onClick={() => setActiveTab("sn")}>
          要货计划SN码
        </Button>
        <Button tone={activeTab === "plan" ? "primary" : "default"} onClick={() => setActiveTab("plan")}>
          要货计划子
        </Button>
      </div>
      <div className="p-4">
        <EntityPage
          key={config.key}
          config={config}
          enableFieldSettings
          fixedFilters={fixedFilters}
          fixedValues={fixedValues}
          hideCreateImportTemplate={false}
          hideHeading
        />
      </div>
    </Panel>
  );
}
