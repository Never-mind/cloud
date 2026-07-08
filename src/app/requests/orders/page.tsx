import { OrderListPage } from "@/components/order-list-page";
import { getEntityConfig } from "@/lib/modules";

export default function Page() {
  return (
    <OrderListPage
      mode="requests"
      masterConfig={getEntityConfig("requests")!}
      detailConfig={getEntityConfig("request-items")!}
      relationKey="requestNo"
    />
  );
}
