import { InternalServiceFeeSparesPage } from "@/components/internal-service-fee-spares-page";
import { queryRows } from "@/lib/db";

export default async function Page() {
  const countries = await queryRows<{ code: string; nameZh?: string }>(
    "SELECT code, nameZh FROM countries ORDER BY code ASC",
  );
  return <InternalServiceFeeSparesPage countries={countries} />;
}
