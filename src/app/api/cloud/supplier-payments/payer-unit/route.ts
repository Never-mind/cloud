import { NextRequest, NextResponse } from "next/server";
import { getCloudSupplierPayerUnitDefault, setCloudSupplierPayerUnitDefault } from "@/lib/cloud-service";

/** 读取供应商付款的默认付款单位（承接单位）。 */
export async function GET() {
  try {
    return NextResponse.json({ payerUnit: await getCloudSupplierPayerUnitDefault() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "默认付款单位加载失败" }, { status: 500 });
  }
}

/** 设置默认付款单位，并补齐付款单位为空的付款记录。 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await setCloudSupplierPayerUnitDefault(String(body?.undertakingUnitId ?? "")));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "默认付款单位保存失败" }, { status: 400 });
  }
}
