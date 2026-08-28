import { notFound } from "next/navigation";
import { EntityPage } from "@/components/entity-page";
import { getEntityConfig } from "@/lib/modules";

const sections: Record<string, string> = {
  "customer-contacts": "customer-contacts",
  "customer-bank-accounts": "customer-bank-accounts",
  "supplier-contacts": "supplier-contacts",
  "supplier-bank-accounts": "supplier-bank-accounts",
  "undertaking-unit-contacts": "undertaking-unit-contacts",
  "undertaking-unit-bank-accounts": "undertaking-unit-bank-accounts",
};

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const config = getEntityConfig(sections[section] ?? "");
  if (!config) notFound();
  return <EntityPage config={config} />;
}
