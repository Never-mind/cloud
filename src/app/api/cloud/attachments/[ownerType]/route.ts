import { NextRequest, NextResponse } from "next/server";
import { deleteCloudAttachment, findCloudAttachment } from "@/lib/cloud-service";
import { cloudAttachmentResponse } from "@/lib/cloud-attachment-response";

export async function GET(_request: NextRequest, context: { params: Promise<{ ownerType: string }> }) {
  const { ownerType: id } = await context.params;
  const attachment = await findCloudAttachment(decodeURIComponent(id));
  if (!attachment) return NextResponse.json({ error: "附件不存在" }, { status: 404 });
  return cloudAttachmentResponse(attachment);
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ ownerType: string }> }) {
  const { ownerType: id } = await context.params;
  await deleteCloudAttachment(decodeURIComponent(id));
  return NextResponse.json({ ok: true });
}
