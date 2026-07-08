import { EntityPage } from "@/components/entity-page";
import { getEntityConfig } from "@/lib/modules";

export default function Page() {
  return <EntityPage config={getEntityConfig("prepayment-contract-items")!} />;
}
