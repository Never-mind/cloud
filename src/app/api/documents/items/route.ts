import { NextRequest, NextResponse } from "next/server";
import { DOCUMENT_ROOT_ID, getDocumentItems } from "@/lib/document-service";

export async function GET(request: NextRequest) {
  try {
    const folderId = request.nextUrl.searchParams.get("folderId") || DOCUMENT_ROOT_ID;
    const data = await getDocumentItems(folderId, {
      page: Number(request.nextUrl.searchParams.get("page") ?? 1),
      pageSize: Number(request.nextUrl.searchParams.get("pageSize") ?? 20),
      keyword: request.nextUrl.searchParams.get("keyword") ?? "",
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取文档失败" }, { status: 400 });
  }
}
