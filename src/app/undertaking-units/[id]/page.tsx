import { PartyDetailPage } from "@/components/party-detail-page";
import { getEntityConfig } from "@/lib/modules";

export default async function UndertakingUnitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PartyDetailPage config={getEntityConfig("undertaking-units")!} id={id} related={[getEntityConfig("undertaking-unit-contacts")!, getEntityConfig("undertaking-unit-bank-accounts")!]} />;
}
