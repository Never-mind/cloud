import { PrepaymentWriteOffAdjustmentDetailPage } from "@/components/prepayment-writeoff-adjustment-detail-page";

export default async function Page({ params }: { params: Promise<{ adjustmentNo: string }> }) {
  const { adjustmentNo } = await params;
  return <PrepaymentWriteOffAdjustmentDetailPage adjustmentNo={decodeURIComponent(adjustmentNo)} />;
}
