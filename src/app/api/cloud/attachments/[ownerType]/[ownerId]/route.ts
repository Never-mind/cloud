import { NextRequest, NextResponse } from "next/server";
import { addCloudAttachment, listCloudAttachments } from "@/lib/cloud-service";
import { getOperationActor } from "@/lib/operation-actor";

const OWNER_TYPES = new Set(["reconciliation", "collection", "supplier_payment"]);

export async function GET(_request: NextRequest, context: { params: Promise<{ ownerType: string; ownerId: string }> }) {
  const { ownerType, ownerId } = await context.params;
  if (!OWNER_TYPES.has(ownerType)) return NextResponse.json({ error: "附件类型无效" }, { status: 400 });
  try { return NextResponse.json(await listCloudAttachments(ownerType, decodeURIComponent(ownerId))); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "附件加载失败" }, { status: 500 }); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ ownerType: string; ownerId: string }> }) {
  const { ownerType, ownerId } = await context.params;
  if (!OWNER_TYPES.has(ownerType)) return NextResponse.json({ error: "附件类型无效" }, { status: 400 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "请选择附件" }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "附件不能超过20MB" }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await addCloudAttachment(ownerType, decodeURIComponent(ownerId), { fileName: file.name, fileType: file.type || "application/octet-stream", fileSize: file.size, dataUrl: `data:${file.type || "application/octet-stream"};base64,${buffer.toString("base64")}` }, await getOperationActor(request));
    return NextResponse.json(attachment, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "附件上传失败" }, { status: 400 }); }
}
