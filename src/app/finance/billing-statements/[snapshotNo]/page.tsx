import { BillingStatementDetailPage } from "@/components/billing-statement-detail-page";

export default async function Page({
  params,
}: {
  params: Promise<{ snapshotNo: string }>;
}) {
  const { snapshotNo } = await params;
  return <BillingStatementDetailPage snapshotNo={decodeURIComponent(snapshotNo)} />;
}
