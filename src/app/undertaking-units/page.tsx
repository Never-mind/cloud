import { EntityPage } from "@/components/entity-page";
import { getEntityConfig } from "@/lib/modules";

export default function UndertakingUnitsPage() {
  return <EntityPage config={getEntityConfig("undertaking-units")!} />;
}
