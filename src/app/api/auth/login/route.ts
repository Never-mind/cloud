import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, validateLogin } from "@/lib/auth";
import { applyLoginCookies } from "@/lib/auth-login-cookies";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? "");
    const password = String(body.password ?? "");

    const valid = await validateLogin(email, password);
    if (!valid) {
      await recordOperationLog({
        domainKey: "common",
        moduleKey: "auth",
        action: "login",
        entityType: "user",
        entityId: email.trim().toLowerCase() || null,
        requestId: getOperationRequestId(request),
        detail: { result: "failed", reason: "invalid_credentials" },
      });
      return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
    }

    const user = await getUserByEmail(email);
    await recordOperationLog({
      actor: user,
      domainKey: "common",
      moduleKey: "auth",
      action: "login",
      entityType: "user",
      entityId: user?.userId ?? null,
      requestId: getOperationRequestId(request),
      detail: { result: "success" },
    });

    const response = NextResponse.json({ ok: true });
    await applyLoginCookies(response, request, email);
    return response;
  } catch {
    return NextResponse.json({ error: "登录服务暂时不可用，请联系管理员" }, { status: 503 });
  }
}
