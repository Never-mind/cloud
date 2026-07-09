import { NextResponse } from "next/server";
import { getDocumentTree } from "@/lib/document-service";

export async function GET() {
  const data = await getDocumentTree();
  return NextResponse.json({ folders: data });
}
