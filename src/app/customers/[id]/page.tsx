import { PartyDetailPage } from "@/components/party-detail-page";
import { getEntityConfig } from "@/lib/modules";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PartyDetailPage config={getEntityConfig("customers")!} id={id} related={[getEntityConfig("customer-contacts")!, getEntityConfig("customer-bank-accounts")!]} />;
}
