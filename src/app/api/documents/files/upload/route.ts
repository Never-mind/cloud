import { NextRequest, NextResponse } from "next/server";
import { saveUploadedDocumentFile } from "@/lib/document-service";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_BATCH_COUNT = 20;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const folderId = String(formData.get("folderId") || "ROOT");
    const files = formData.getAll("files").filter((item): item is File => item instanceof File);

    if (files.length === 0) {
      throw new Error("请选择需要上传的文件");
    }
    if (files.length > MAX_BATCH_COUNT) {
      throw new Error(`单次最多上传 ${MAX_BATCH_COUNT} 个文件`);
    }

    const uploaded = [];
    const failed = [];
    for (const file of files) {
      try {
        if (file.size > MAX_FILE_SIZE) {
          throw new Error("文件超过 50MB");
        }
        const bytes = Buffer.from(await file.arrayBuffer());
        const saved = await saveUploadedDocumentFile({
          folderId,
          originalName: file.name,
          mimeType: file.type,
          bytes,
        });
        uploaded.push(saved);
      } catch (error) {
        failed.push({ name: file.name, reason: error instanceof Error ? error.message : "上传失败" });
      }
    }

    return NextResponse.json({ total: files.length, success: uploaded.length, failed, files: uploaded });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "上传失败" }, { status: 400 });
  }
}
