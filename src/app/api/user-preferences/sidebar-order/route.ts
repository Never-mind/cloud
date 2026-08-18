import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { getSidebarOrderPreference, saveSidebarOrderPreference } from "@/lib/user-preference-service";

export async function GET(request: NextRequest) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    return NextResponse.json({ order: await getSidebarOrderPreference(email) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取目录排序失败" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ order: await saveSidebarOrderPreference(email, body.order) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存目录排序失败" }, { status: 400 });
  }
}
