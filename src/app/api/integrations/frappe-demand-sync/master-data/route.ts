import { NextResponse } from "next/server";
import { getFrappeDemandMappingMasterData } from "@/lib/frappe-demand-sync-service";

export async function GET() {
  try {
    return NextResponse.json(await getFrappeDemandMappingMasterData());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "本地档案加载失败" }, { status: 500 });
  }
}
