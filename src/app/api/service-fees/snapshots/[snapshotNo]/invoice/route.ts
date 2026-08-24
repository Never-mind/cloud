import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { deleteServiceFeeInvoice, getServiceFeeInvoice, saveServiceFeeInvoice } from "@/lib/service-fee-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ snapshotNo: string }> }) {
  try {
    const { snapshotNo } = await context.params;
    const invoice = await getServiceFeeInvoice(decodeURIComponent(snapshotNo));
    return new NextResponse(invoice.bytes, {
      headers: {
        "Content-Type": invoice.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(invoice.fileName)}`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票附件下载失败" }, { status: 400 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ snapshotNo: string }> }) {
  try {
    const { snapshotNo } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("请选择要上传的发票附件");
    const data = await saveServiceFeeInvoice({
      snapshotNo: decodeURIComponent(snapshotNo),
      originalName: file.name,
      mimeType: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
      uploadedBy: getAuthenticatedUserEmail(request),
    });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票附件上传失败" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ snapshotNo: string }> }) {
  try {
    const { snapshotNo } = await context.params;
    return NextResponse.json(await deleteServiceFeeInvoice(decodeURIComponent(snapshotNo)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票附件删除失败" }, { status: 400 });
  }
}
