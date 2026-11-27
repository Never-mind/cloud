import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { createInternalServiceSpare, getInternalServiceSpare, listInternalServiceSpares } from "@/lib/internal-service-fee-spare-service";
import type { InternalServiceSpareInput } from "@/lib/internal-service-fee-spare";

export async function GET(request: NextRequest) {
  try {
    const ledgerId = request.nextUrl.searchParams.get("ledgerId")?.trim();
    return NextResponse.json(ledgerId
      ? await getInternalServiceSpare(ledgerId)
      : await listInternalServiceSpares(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "备件管理费加载失败" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = getAuthenticatedUserEmail(request);
    if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    return NextResponse.json(await createInternalServiceSpare(body as InternalServiceSpareInput, actor), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "备件管理费保存失败" }, { status: 400 });
  }
}
