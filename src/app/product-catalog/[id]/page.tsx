import { redirect } from "next/navigation";

export default async function ProductCatalogDetailRoutePage({ params }: { params: Promise<{ id: string }> }) {
  await params;
  redirect("/product-catalog");
}
