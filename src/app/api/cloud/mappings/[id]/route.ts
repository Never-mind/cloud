import { NextRequest, NextResponse } from "next/server";
import { deleteCloudMapping, saveCloudMapping } from "@/lib/cloud-service";
import { getOperationActor } from "@/lib/operation-actor";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try { return NextResponse.json(await saveCloudMapping(await request.json(), decodeURIComponent(id), await getOperationActor(request))); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "映射保存失败" }, { status: 400 }); }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try { await deleteCloudMapping(decodeURIComponent(id)); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "映射删除失败" }, { status: 400 }); }
}
