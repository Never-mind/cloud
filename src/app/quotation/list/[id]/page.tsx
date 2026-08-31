import { QuotationDetailPage } from "@/components/quotation-list-page";

export default async function QuotationDetailRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuotationDetailPage id={decodeURIComponent(id)} />;
}
