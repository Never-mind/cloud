import { NextRequest, NextResponse } from "next/server";
import { deleteCloudAttachment, findCloudAttachment } from "@/lib/cloud-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ ownerType: string }> }) {
  const { ownerType: id } = await context.params;
  const attachment = await findCloudAttachment(decodeURIComponent(id));
  if (!attachment) return NextResponse.json({ error: "附件不存在" }, { status: 404 });
  const match = String(attachment.dataUrl ?? "").match(/^data:([^;,]+)?;base64,([\s\S]*)$/);
  const buffer = match ? Buffer.from(match[2], "base64") : Buffer.from(String(attachment.dataUrl ?? ""));
  return new NextResponse(buffer, { headers: { "Content-Type": String(attachment.fileType || match?.[1] || "application/octet-stream"), "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(String(attachment.fileName).replace(/[\r\n"]/g, "_"))}` } });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ ownerType: string }> }) {
  const { ownerType: id } = await context.params;
  await deleteCloudAttachment(decodeURIComponent(id));
  return NextResponse.json({ ok: true });
}
