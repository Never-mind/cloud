import { NextRequest, NextResponse } from "next/server";
import { createCloudRow, listCloudRows } from "@/lib/cloud-service";
import { getOperationActor } from "@/lib/operation-actor";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listCloudRows(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "华为云对账加载失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await createCloudRow(await request.json(), await getOperationActor(request)), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "手动新增对账单失败" }, { status: 400 });
  }
}
