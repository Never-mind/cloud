import { EntityPage } from "@/components/entity-page";
import { getEntityConfig } from "@/lib/modules";

export default function SuppliersPage() {
  return <EntityPage config={getEntityConfig("suppliers")!} />;
}
