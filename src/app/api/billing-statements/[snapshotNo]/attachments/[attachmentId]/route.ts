import { NextRequest, NextResponse } from "next/server";
import { deleteStatementAttachment } from "@/lib/billing-statement-attachment-service";

export async function DELETE(_request: NextRequest, context: { params: Promise<{ snapshotNo: string; attachmentId: string }> }) {
  try {
    const { snapshotNo, attachmentId } = await context.params;
    await deleteStatementAttachment(decodeURIComponent(snapshotNo), decodeURIComponent(attachmentId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "附件删除失败" }, { status: 400 });
  }
}
