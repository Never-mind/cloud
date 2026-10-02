import { NextRequest, NextResponse } from "next/server";
import { readStatementAttachment } from "@/lib/billing-statement-attachment-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ snapshotNo: string; attachmentId: string }> }) {
  try {
    const { snapshotNo, attachmentId } = await context.params;
    const file = await readStatementAttachment(decodeURIComponent(snapshotNo), decodeURIComponent(attachmentId));
    if (!file) return NextResponse.json({ error: "附件不存在" }, { status: 404 });
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "content-type": file.contentType || "application/octet-stream",
        "content-disposition": `attachment; filename="${encodeURIComponent(file.fileName)}"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "附件下载失败" }, { status: 400 });
  }
}
