import { EntityPage } from "@/components/entity-page";
import { getEntityConfig } from "@/lib/modules";

export default function ProductCatalogPage() {
  return <EntityPage config={getEntityConfig("product-masters")!} />;
}
