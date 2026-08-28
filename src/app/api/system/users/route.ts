import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { createManagedUser, listManagedUsers } from "@/lib/user-service";

export async function GET(request: NextRequest) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    return NextResponse.json({ users: await listManagedUsers(email) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "用户列表加载失败" }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    return NextResponse.json(await createManagedUser(email, await request.json()), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "用户创建失败" }, { status: 400 });
  }
}
