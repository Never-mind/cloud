import type { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, AUTH_SESSION_VALUE, AUTH_USER_COOKIE_NAME, createUserSessionValue } from "./auth";
import { AUTH_PERMISSION_COOKIE_NAME, encodePermissionState } from "./permission-cookie";
import { getPermissionStateForEmail } from "./permission-service";
import { encodeModuleFeatureState, MODULE_FEATURE_COOKIE_NAME } from "./module-feature-definitions";
import { getModuleFeatureState } from "./module-feature-service";

/** 登录会话有效期（秒）。 */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

/**
 * 登录成功后统一下发会话 cookie。
 *
 * 密码登录与飞书登录都走这里，避免两条登录路径出现"一个下了权限 cookie、另一个忘了下"
 * 导致登录后菜单点不动的问题。
 */
export async function applyLoginCookies(response: NextResponse, request: NextRequest, email: string) {
  const secure = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
  response.cookies.set(AUTH_COOKIE_NAME, AUTH_SESSION_VALUE, options);
  response.cookies.set(AUTH_USER_COOKIE_NAME, createUserSessionValue(email), options);
  try {
    response.cookies.set(AUTH_PERMISSION_COOKIE_NAME, encodePermissionState(await getPermissionStateForEmail(email)), options);
  } catch {
    // 权限元数据尚未初始化时也要保证能登录。
  }
  try {
    response.cookies.set(MODULE_FEATURE_COOKIE_NAME, encodeModuleFeatureState(await getModuleFeatureState()), options);
  } catch {
    // 模块开关尚未初始化时也要保证能登录。
  }
}
