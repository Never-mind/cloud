import { NextRequest, NextResponse } from "next/server";
import { getOperationActor } from "@/lib/operation-actor";
import { listCloudMappings, saveCloudMapping } from "@/lib/cloud-service";

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listCloudMappings(request.nextUrl.searchParams)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "映射加载失败" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await saveCloudMapping(await request.json(), null, await getOperationActor(request)), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "映射保存失败" }, { status: 400 }); }
}
