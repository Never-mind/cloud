import { NextRequest, NextResponse } from "next/server";
import { getDocumentFileForDownload } from "@/lib/document-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await context.params;
    const { file, bytes } = await getDocumentFileForDownload(decodeURIComponent(fileId));
    const encodedName = encodeURIComponent(file.originalName).replace(/['()]/g, escape);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "下载文件失败" }, { status: 404 });
  }
}
