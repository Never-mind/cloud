import { NextRequest, NextResponse } from "next/server";
import { findSettlementAttachment } from "@/lib/settlement-project-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; invoiceId: string; attachmentId: string }> }) {
  try {
    const { id, invoiceId, attachmentId } = await context.params;
    const attachment = await findSettlementAttachment(decodeURIComponent(id), decodeURIComponent(invoiceId), decodeURIComponent(attachmentId));
    const match = attachment.dataUrl.match(/^data:([^;,]+)?;base64,([\s\S]*)$/);
    const bytes = match ? Buffer.from(match[2], "base64") : Buffer.from(attachment.dataUrl, "utf8");
    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": attachment.fileType || match?.[1] || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName.replace(/[\r\n"]/g, "_"))}`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票附件下载失败" }, { status: 404 });
  }
}
