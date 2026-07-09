import { NextRequest, NextResponse } from "next/server";
import { createDocumentFolder } from "@/lib/document-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const folder = await createDocumentFolder(String(body.parentId || "ROOT"), String(body.name || ""));
    return NextResponse.json(folder, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "新建文件夹失败" }, { status: 400 });
  }
}
