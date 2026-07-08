import { PrepaymentContractDetailPage } from "@/components/prepayment-contract-detail-page";

export default async function Page({
  params,
}: {
  params: Promise<{ contractNo: string }>;
}) {
  const { contractNo } = await params;
  return <PrepaymentContractDetailPage contractNo={decodeURIComponent(contractNo)} />;
}
