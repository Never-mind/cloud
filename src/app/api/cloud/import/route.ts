import { NextRequest, NextResponse } from "next/server";
import { getOperationActor } from "@/lib/operation-actor";
import { importCloudWorkbook } from "@/lib/cloud-service";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "请选择Excel文件" }, { status: 400 });
    if (!/\.xlsx?$/i.test(file.name)) return NextResponse.json({ error: "仅支持xlsx或xls文件" }, { status: 400 });
    return NextResponse.json(await importCloudWorkbook(Buffer.from(await file.arrayBuffer()), file.name, String(form.get("period") ?? ""), await getOperationActor(request)), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "账单导入失败" }, { status: 400 });
  }
}
