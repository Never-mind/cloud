import { OrderListPage } from "@/components/order-list-page";
import { getEntityConfig } from "@/lib/modules";

export default function Page() {
  return (
    <OrderListPage
      mode="purchase"
      masterConfig={getEntityConfig("purchase-orders")!}
      detailConfig={getEntityConfig("purchase-order-items")!}
      relationKey="purchaseOrderId"
    />
  );
}
