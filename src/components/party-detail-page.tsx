"use client";

import type { EntityConfig } from "@/lib/modules";
import { PartyArchiveDetailPage } from "./party-archive-detail-page";

type Row = Record<string, string | number | boolean | null>;

export function PartyDetailPage({ config, id, related }: { config: EntityConfig; id: string; related: EntityConfig[] }) {
  return <PartyArchiveDetailPage config={config} id={id} related={related} />;
}
