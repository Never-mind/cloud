import { MasterDetailPage } from "@/components/master-detail-page";
import { getEntityConfig } from "@/lib/modules";

export default function CustomerPosPage() {
  return (
    <MasterDetailPage
      masterConfig={getEntityConfig("customer-pos")!}
      detailConfig={getEntityConfig("customer-po-items")!}
      relationKey="poId"
    />
  );
}
