import { NextRequest, NextResponse } from "next/server";
import { confirmCloudRow } from "@/lib/cloud-service";
import { getOperationActor } from "@/lib/operation-actor";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await confirmCloudRow(decodeURIComponent(id), body.confirmed !== false, await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "确认失败" }, { status: 400 });
  }
}
