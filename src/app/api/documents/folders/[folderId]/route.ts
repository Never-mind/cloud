import { NextRequest, NextResponse } from "next/server";
import { deleteDocumentFolder, renameDocumentFolder } from "@/lib/document-service";

export async function PUT(request: NextRequest, context: { params: Promise<{ folderId: string }> }) {
  try {
    const { folderId } = await context.params;
    const body = await request.json();
    const folder = await renameDocumentFolder(decodeURIComponent(folderId), String(body.name || ""));
    return NextResponse.json(folder);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "重命名文件夹失败" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ folderId: string }> }) {
  try {
    const { folderId } = await context.params;
    await deleteDocumentFolder(decodeURIComponent(folderId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除文件夹失败" }, { status: 400 });
  }
}
