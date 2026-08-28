import { EntityPage } from "@/components/entity-page";
import { getEntityConfig } from "@/lib/modules";

export default function CustomersPage() {
  return <EntityPage config={getEntityConfig("customers")!} />;
}
