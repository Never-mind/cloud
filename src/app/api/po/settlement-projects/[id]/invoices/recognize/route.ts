import { NextRequest, NextResponse } from "next/server";
import { getSettlementProjectIssueContext } from "@/lib/settlement-project-service";
import { recognizeInvoiceFile } from "@/lib/invoice-recognition-service";

/**
 * 上传发票识别：只解析、不入库，把识别结果回给前端确认后再走新增发票。
 * 入参 multipart/form-data：file
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const projectId = decodeURIComponent((await context.params).id);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("请选择要识别的发票文件");
    if (file.size > 20 * 1024 * 1024) throw new Error("发票文件不能超过 20MB");
    const project = await getSettlementProjectIssueContext(projectId);
    const recognition = await recognizeInvoiceFile({
      projectId,
      fileName: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      project,
    });
    return NextResponse.json({ recognition });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票识别失败" }, { status: 400 });
  }
}
