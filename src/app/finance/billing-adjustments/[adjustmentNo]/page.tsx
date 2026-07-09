import { BillingAdjustmentDetailPage } from "@/components/billing-adjustment-detail-page";

export default async function Page({ params }: { params: Promise<{ adjustmentNo: string }> }) {
  const { adjustmentNo } = await params;
  return <BillingAdjustmentDetailPage adjustmentNo={decodeURIComponent(adjustmentNo)} />;
}
