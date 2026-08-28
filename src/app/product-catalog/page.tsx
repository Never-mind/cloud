import { ProductCatalogListPage } from "@/components/product-catalog-page";
import { getEntityConfig } from "@/lib/modules";

export default function ProductCatalogPage() {
  return <ProductCatalogListPage config={getEntityConfig("product-masters")!} />;
}
