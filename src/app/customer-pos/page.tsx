import { CustomerPoListPage } from "@/components/customer-po-page";
import { getEntityConfig } from "@/lib/modules";

export default function CustomerPosPage() {
  return <CustomerPoListPage config={getEntityConfig("customer-pos")!} />;
}
