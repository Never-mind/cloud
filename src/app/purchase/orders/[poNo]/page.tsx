import { OrderDetailPage } from "@/components/order-detail-page";
import { getEntityConfig } from "@/lib/modules";

export default async function Page({
  params,
}: {
  params: Promise<{ poNo: string }>;
}) {
  const { poNo } = await params;

  return (
    <OrderDetailPage
      id={decodeURIComponent(poNo)}
      mode="purchase"
      masterConfig={getEntityConfig("purchase-orders")!}
      detailConfig={getEntityConfig("purchase-order-items")!}
      relationKey="purchaseOrderId"
    />
  );
}
