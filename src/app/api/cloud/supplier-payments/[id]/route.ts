import { NextRequest, NextResponse } from "next/server";
import { updateCloudSupplierPayment } from "@/lib/cloud-service";
import { getOperationActor } from "@/lib/operation-actor";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try { return NextResponse.json(await updateCloudSupplierPayment(decodeURIComponent(id), await request.json(), await getOperationActor(request))); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "付款保存失败" }, { status: 400 }); }
}
