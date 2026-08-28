import { ProductCatalogDetailPage } from "@/components/product-catalog-page";
import { getEntityConfig } from "@/lib/modules";

export default async function ProductCatalogDetailRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductCatalogDetailPage masterConfig={getEntityConfig("product-masters")!} modelConfig={getEntityConfig("product-models")!} specConfig={getEntityConfig("product-specifications")!} id={id} />;
}
