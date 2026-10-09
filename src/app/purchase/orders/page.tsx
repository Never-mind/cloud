import { PurchaseOrdersWorkspace } from "@/components/purchase-orders-workspace";
import { getEntityConfig } from "@/lib/modules";

export default function Page() {
  return (
    <PurchaseOrdersWorkspace
      masterConfig={getEntityConfig("purchase-orders")!}
      detailConfig={getEntityConfig("purchase-order-items")!}
    />
  );
}
