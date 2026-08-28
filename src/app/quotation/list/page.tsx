import { MasterDetailPage } from "@/components/master-detail-page";
import { getEntityConfig } from "@/lib/modules";

export default function QuotationListPage() {
  return (
    <MasterDetailPage
      masterConfig={getEntityConfig("quotations")!}
      detailConfig={getEntityConfig("quotation-items")!}
      relationKey="quotationId"
    />
  );
}
