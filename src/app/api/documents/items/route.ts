import { NextRequest, NextResponse } from "next/server";
import { DOCUMENT_ROOT_ID, getDocumentItems } from "@/lib/document-service";

export async function GET(request: NextRequest) {
  try {
    const folderId = request.nextUrl.searchParams.get("folderId") || DOCUMENT_ROOT_ID;
    const data = await getDocumentItems(folderId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取文档失败" }, { status: 400 });
  }
}
