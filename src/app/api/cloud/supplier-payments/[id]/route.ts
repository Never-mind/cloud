import { NextRequest, NextResponse } from "next/server";
import { updateCloudSupplierPayment } from "@/lib/cloud-service";
import { getOperationActor } from "@/lib/operation-actor";
import { recordOperationLog } from "@/lib/operation-log";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await request.json(); const actor = await getOperationActor(request);
    const result = await updateCloudSupplierPayment(decodeURIComponent(id), body, actor);
    if (body.recognitionFacts) await recordOperationLog({ actor, domainKey: "cloud", moduleKey: "supplier-payments", action: "confirm_recognition", entityId: id, detail: { recognized: body.recognitionFacts, confirmed: result } });
    return NextResponse.json(result);
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "付款保存失败" }, { status: 400 }); }
}
