import { CustomerPoDetailPage } from "@/components/customer-po-page";
import { getEntityConfig } from "@/lib/modules";

export default async function CustomerPoDetailRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerPoDetailPage config={getEntityConfig("customer-pos")!} id={decodeURIComponent(id)} />;
}
