import { EntityPage } from "@/components/entity-page";
import { getEntityConfig } from "@/lib/modules";

export default function HistoryQuotationsPage() {
  return <EntityPage config={getEntityConfig("history-quotations")!} />;
}
