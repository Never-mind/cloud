import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { updateManagedUser, updateUserPermissions } from "@/lib/user-service";

export async function PUT(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const { userId } = await context.params;
    const body = await request.json();
    await updateManagedUser(email, userId, body);
    if (body.permissions !== undefined) await updateUserPermissions(email, userId, body.permissions);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "用户更新失败" }, { status: 400 });
  }
}
