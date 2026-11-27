import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { importInternalServiceSpares } from "@/lib/internal-service-fee-spare-service";
import type { InternalServiceSpareInput } from "@/lib/internal-service-fee-spare";

export async function POST(request: NextRequest) {
  try {
    const actor = getAuthenticatedUserEmail(request);
    if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    if (!Array.isArray(body.items)) return NextResponse.json({ error: "导入数据格式不正确" }, { status: 400 });
    return NextResponse.json(await importInternalServiceSpares(
      body.items as InternalServiceSpareInput[],
      actor,
      String(body.fileName ?? "Excel导入"),
    ), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "备件管理费导入失败" }, { status: 400 });
  }
}
