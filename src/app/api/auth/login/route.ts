import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, AUTH_SESSION_VALUE, AUTH_USER_COOKIE_NAME, createUserSessionValue, validateLogin } from "@/lib/auth";
import { encodeModuleFeatureState, MODULE_FEATURE_COOKIE_NAME } from "@/lib/module-feature-definitions";
import { getModuleFeatureState } from "@/lib/module-feature-service";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");

  if (!(await validateLogin(email, password))) {
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, AUTH_SESSION_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  response.cookies.set(AUTH_USER_COOKIE_NAME, createUserSessionValue(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  try {
    response.cookies.set(MODULE_FEATURE_COOKIE_NAME, encodeModuleFeatureState(await getModuleFeatureState()), {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
  } catch {
    // The middleware has the same defaults and the feature table can be initialized later.
  }
  return response;
}
