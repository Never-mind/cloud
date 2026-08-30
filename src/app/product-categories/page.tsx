import { EntityPage } from "@/components/entity-page";
import { getEntityConfig } from "@/lib/modules";

export default function ProductCategoriesPage() {
  return <EntityPage config={getEntityConfig("product-categories")!} />;
}
