import { PartyDetailPage } from "@/components/party-detail-page";
import { getEntityConfig } from "@/lib/modules";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PartyDetailPage config={getEntityConfig("suppliers")!} id={id} related={[getEntityConfig("supplier-contacts")!, getEntityConfig("supplier-bank-accounts")!]} />;
}
