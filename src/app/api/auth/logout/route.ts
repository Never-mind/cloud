import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, AUTH_USER_COOKIE_NAME } from "@/lib/auth-session";
import { MODULE_FEATURE_COOKIE_NAME } from "@/lib/module-feature-definitions";
import { AUTH_PERMISSION_COOKIE_NAME } from "@/lib/permission-cookie";
import { getOperationActorForLog, getOperationRequestId, recordOperationLog } from "@/lib/operation-log";
import { resolveRequestOrigin, safeInternalPath } from "@/lib/request-origin";

/**
 * GET 退出：清 cookie 并跳转，用于"会话失效自动登出"（账号被删除/停用后浏览器还带着旧 cookie）。
 * 只允许站内路径，避免开放重定向。
 */
export async function GET(request: NextRequest) {
  const target = safeInternalPath(request.nextUrl.searchParams.get("next"), "/login");
  // 同样按真实请求头拼地址，避免退出后跳到 localhost 而 cookie 清在别的域上。
  const response = NextResponse.redirect(new URL(target, resolveRequestOrigin(request)));
  clearAuthCookies(response, request);
  return response;
}

export async function POST(request: NextRequest) {
  await recordOperationLog({ actor: await getOperationActorForLog(request), domainKey: "common", moduleKey: "auth", action: "logout", entityType: "user", requestId: getOperationRequestId(request), detail: { result: "success" } });
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response, request);
  return response;
}

function clearAuthCookies(response: NextResponse, request: NextRequest) {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(AUTH_USER_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(MODULE_FEATURE_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(AUTH_PERMISSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
