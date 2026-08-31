import { NextRequest, NextResponse } from "next/server";
import { executeRaw } from "@/lib/db";
import { getOperationActor } from "@/lib/operation-actor";
import { updateCloudRow } from "@/lib/cloud-service";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await updateCloudRow(decodeURIComponent(id), await request.json(), await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await executeRaw("DELETE FROM merge_cloud_attachments WHERE ownerType IN ('reconciliation', 'collection', 'invoice') AND ownerId = :id", { id: decodeURIComponent(id) });
    await executeRaw("DELETE FROM merge_cloud_rows WHERE id = :id", { id: decodeURIComponent(id) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 400 });
  }
}
