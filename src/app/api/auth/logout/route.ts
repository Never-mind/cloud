import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, AUTH_USER_COOKIE_NAME } from "@/lib/auth-session";
import { MODULE_FEATURE_COOKIE_NAME } from "@/lib/module-feature-definitions";
import { AUTH_PERMISSION_COOKIE_NAME } from "@/lib/permission-cookie";
import { getOperationActorForLog, getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest) {
  await recordOperationLog({ actor: await getOperationActorForLog(request), domainKey: "common", moduleKey: "auth", action: "logout", entityType: "user", requestId: getOperationRequestId(request), detail: { result: "success" } });
  const response = NextResponse.json({ ok: true });
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
  return response;
}
