import { NextRequest, NextResponse } from "next/server";
import { deleteDocumentFile, renameDocumentFile } from "@/lib/document-service";

export async function PUT(request: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await context.params;
    const body = await request.json();
    const file = await renameDocumentFile(decodeURIComponent(fileId), String(body.name || ""));
    return NextResponse.json(file);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "重命名文件失败" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await context.params;
    await deleteDocumentFile(decodeURIComponent(fileId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除文件失败" }, { status: 400 });
  }
}
