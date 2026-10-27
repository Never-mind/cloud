import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { recognizeInvoiceFile } from "@/lib/invoice-recognition-service";

/**
 * 采购订单上传发票后的字段识别：只解析、不写库。
 * 附件本身由前端继续调用 /api/common/attachments/purchase-orders/{id} 保存。
 */
export async function POST(request: NextRequest) {
  if (!getAuthenticatedUserEmail(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("请选择要识别的发票文件");
    if (file.size > 20 * 1024 * 1024) throw new Error("发票文件不能超过 20MB");
    const recognition = await recognizeInvoiceFile({
      direction: "cost",
      fileName: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      project: { exchangeRateUsd: 0, exchangeRateMxn: 0 },
    });
    return NextResponse.json({ recognition });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票识别失败" }, { status: 400 });
  }
}
