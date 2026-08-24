import { NonInstanceSettlementPage } from "@/components/non-instance-settlement-page";
import { queryRows } from "@/lib/db";

export default async function Page() {
  const countries = await queryRows<{ code: string; nameZh?: string }>("SELECT code, nameZh FROM countries ORDER BY code ASC");
  return <NonInstanceSettlementPage countries={countries} />;
}
