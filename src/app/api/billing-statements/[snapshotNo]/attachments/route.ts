import { NextRequest, NextResponse } from "next/server";
import {
  addStatementAttachment,
  listStatementAttachments,
} from "@/lib/billing-statement-attachment-service";
import { getOperationActor } from "@/lib/operation-actor";

/** 月账单对账单附件：列表 + 上传（前端把文件读成 data URL 提交，服务端决定落 OBS 还是数据库）。 */
export async function GET(_request: NextRequest, context: { params: Promise<{ snapshotNo: string }> }) {
  try {
    const snapshotNo = decodeURIComponent((await context.params).snapshotNo);
    return NextResponse.json({ items: await listStatementAttachments(snapshotNo) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "附件加载失败" }, { status: 400 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ snapshotNo: string }> }) {
  try {
    const snapshotNo = decodeURIComponent((await context.params).snapshotNo);
    const actor = await getOperationActor(request);
    const result = await addStatementAttachment(snapshotNo, await request.json(), actor);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "附件上传失败" }, { status: 400 });
  }
}
