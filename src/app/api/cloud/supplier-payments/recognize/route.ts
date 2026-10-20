import { NextRequest, NextResponse } from "next/server";
import { recognizeInvoiceFile } from "@/lib/invoice-recognition-service";

/**
 * 华为云供应商付款：只解析发票并回填开票字段，不写入发票/付款表。
 * 入参 multipart/form-data：file
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("请选择要识别的发票文件");
    if (file.size > 20 * 1024 * 1024) throw new Error("发票文件不能超过 20MB");
    const recognition = await recognizeInvoiceFile({
      // 这里不落到某个结算项目；用独立占位 key 避免去查项目的重复发票。
      projectId: "cloud-supplier-payment",
      fileName: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      // 发票上没有汇率时保持为空，不拿项目汇率猜一个值。
      project: { exchangeRateUsd: 0, exchangeRateMxn: 0 },
    });
    if (recognition.form.type === "income") {
      throw new Error("识别为收入发票（我方开给客户），不是供应商开给我们的发票，请核对后再上传");
    }
    return NextResponse.json({ recognition });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票识别失败" }, { status: 400 });
  }
}
