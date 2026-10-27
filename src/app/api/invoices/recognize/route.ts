import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";
import { recognizeInvoiceFile } from "@/lib/invoice-recognition-service";

export async function POST(request: NextRequest) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email || !hasPermission(await getPermissionStateForEmail(email), "invoices", "create")) throw new Error("当前账号没有发票管理的操作权限");
    const body = await request.formData();
    const file = body.get("file");
    if (!(file instanceof File)) throw new Error("请选择发票文件");
    if (file.size > 20 * 1024 * 1024) throw new Error("识别文件不能超过 20MB，可手工登记票面信息");
    const recognition = await recognizeInvoiceFile({ fileName: file.name, bytes: Buffer.from(await file.arrayBuffer()), direction: "income" });
    return NextResponse.json({ recognition });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票识别失败" }, { status: 400 });
  }
}
