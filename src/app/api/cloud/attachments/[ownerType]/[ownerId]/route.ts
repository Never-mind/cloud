import { NextRequest, NextResponse } from "next/server";
import { findCloudAttachment, listCloudAttachments, storeCloudAttachment } from "@/lib/cloud-service";
import { getOperationActor } from "@/lib/operation-actor";
import { cloudAttachmentResponse } from "@/lib/cloud-attachment-response";

// invoice = 客户开票附件；supplier_payment = 供应商付款发票附件；crm_invoice = CRM 同步回来的发票 PDF。
const OWNER_TYPES = new Set(["reconciliation", "collection", "invoice", "supplier_payment", "crm_invoice"]);

export async function GET(_request: NextRequest, context: { params: Promise<{ ownerType: string; ownerId: string }> }) {
  const { ownerType, ownerId } = await context.params;
  if (!OWNER_TYPES.has(ownerType)) return NextResponse.json({ error: "附件类型无效" }, { status: 400 });
  const ownerReference = decodeURIComponent(ownerId);
  try {
    const items = await listCloudAttachments(ownerType, ownerReference);
    /**
     * 兼容"下载直链写成 /api/cloud/attachments/<ownerType>/<附件ID>"的历史写法：
     * 这种地址按列表口径查必然为空，此时若第二段本身就是一个附件 ID，直接把文件返回，
     * 避免点下载只拿到一个空 JSON。列附件清单的调用（ownerId 是对账行ID）不受影响。
     */
    if (!items.length) {
      const direct = await findCloudAttachment(ownerReference);
      if (direct) return await cloudAttachmentResponse(direct);
    }
    return NextResponse.json(items);
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "附件加载失败" }, { status: 500 }); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ ownerType: string; ownerId: string }> }) {
  const { ownerType, ownerId } = await context.params;
  if (!OWNER_TYPES.has(ownerType)) return NextResponse.json({ error: "附件类型无效" }, { status: 400 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "请选择附件" }, { status: 400 });
    if (file.size > 200 * 1024 * 1024) return NextResponse.json({ error: "附件不能超过200MB" }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await storeCloudAttachment(
      ownerType,
      decodeURIComponent(ownerId),
      { fileName: file.name, fileType: file.type || "application/octet-stream", bytes: buffer },
      await getOperationActor(request),
    );
    return NextResponse.json(attachment, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "附件上传失败" }, { status: 400 }); }
}
