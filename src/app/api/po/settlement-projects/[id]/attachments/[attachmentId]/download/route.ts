import { NextRequest, NextResponse } from "next/server";
import { findSettlementAttachment } from "@/lib/settlement-project-service";
import { readInvoiceAttachmentFile } from "@/lib/invoice-attachment-download";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    const { id, attachmentId } = await context.params;
    const attachment = await findSettlementAttachment(decodeURIComponent(id), null, decodeURIComponent(attachmentId));
    const file = await readInvoiceAttachmentFile(attachment);
    if (!file) return NextResponse.json({ error: "附件内容不存在" }, { status: 404 });
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName.replace(/[\r\n"]/g, "_"))}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "附件下载失败" }, { status: 404 });
  }
}
