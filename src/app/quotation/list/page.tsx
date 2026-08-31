import { QuotationListPage } from "@/components/quotation-list-page";
import { getEntityConfig } from "@/lib/modules";

export default function QuotationListRoutePage() {
  return <QuotationListPage config={getEntityConfig("quotations")!} />;
}
