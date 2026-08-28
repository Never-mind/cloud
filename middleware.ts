import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, AUTH_SESSION_VALUE } from "@/lib/auth-session";
import {
  decodeModuleFeatureState,
  getModuleFeatureKeyForRoute,
  isModuleFeatureToggleable,
  isModuleFeatureEnabled,
  MODULE_FEATURE_COOKIE_NAME,
} from "@/lib/module-feature-definitions";
import {
  EMBEDDED_COOKIE_MAX_AGE,
  EMBEDDED_COOKIE_NAME,
  EMBEDDED_REQUEST_HEADER,
  getEmbeddedCookiePath,
} from "@/lib/embedded-workspace";
import { decodePermissionState } from "@/lib/permission-middleware";
import { getRoutePermission, hasPermission } from "@/lib/permission-definitions";
import { AUTH_PERMISSION_COOKIE_NAME } from "@/lib/permission-middleware";

const publicPaths = ["/login", "/api/auth/login"];

function applyEmbeddedCookie(response: NextResponse, request: NextRequest, embedded = false) {
  if (!embedded || request.cookies.get(EMBEDDED_COOKIE_NAME)?.value === "1") return response;
  response.cookies.set(EMBEDDED_COOKIE_NAME, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: getEmbeddedCookiePath(request.nextUrl.pathname),
    maxAge: EMBEDDED_COOKIE_MAX_AGE,
  });
  return response;
}

function nextResponse(request: NextRequest, embedded: boolean) {
  const requestHeaders = new Headers(request.headers);
  if (embedded) requestHeaders.set(EMBEDDED_REQUEST_HEADER, "1");
  return applyEmbeddedCookie(
    NextResponse.next({ request: { headers: requestHeaders } }),
    request,
    embedded,
  );
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublicPath = publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const isLoggedIn = request.cookies.get(AUTH_COOKIE_NAME)?.value === AUTH_SESSION_VALUE;
  const embedded = request.nextUrl.searchParams.get("embed") === "1"
    || request.cookies.get(EMBEDDED_COOKIE_NAME)?.value === "1";

  if (isPublicPath) {
    if (pathname === "/login" && isLoggedIn) {
      return applyEmbeddedCookie(NextResponse.redirect(new URL("/", request.url)), request, embedded);
    }
    return nextResponse(request, embedded);
  }

  if (!isLoggedIn) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    if (search.includes("embed=1")) loginUrl.searchParams.set("embed", "1");
    return applyEmbeddedCookie(NextResponse.redirect(loginUrl), request, embedded);
  }

  const routePermission = getRoutePermission(pathname, request.method);
  const moduleKey = getModuleFeatureKeyForRoute(pathname) ?? routePermission?.moduleKey;
  if (moduleKey && isModuleFeatureToggleable(moduleKey)) {
    const featureState = decodeModuleFeatureState(request.cookies.get(MODULE_FEATURE_COOKIE_NAME)?.value);
    if (!isModuleFeatureEnabled(moduleKey, featureState)) {
      if (pathname.startsWith("/api/")) {
        return applyEmbeddedCookie(NextResponse.json({ error: "该功能模块当前未启用" }, { status: 403 }), request);
      }
      const disabledUrl = new URL("/module-disabled", request.url);
      disabledUrl.searchParams.set("route", pathname);
      if (search.includes("embed=1")) disabledUrl.searchParams.set("embed", "1");
      return applyEmbeddedCookie(NextResponse.redirect(disabledUrl), request, embedded);
    }
  }

  const permissionState = await decodePermissionState(request.cookies.get(AUTH_PERMISSION_COOKIE_NAME)?.value);
  if (routePermission && permissionState && !hasPermission(permissionState, routePermission.moduleKey, routePermission.action)) {
    if (pathname.startsWith("/api/")) {
      return applyEmbeddedCookie(NextResponse.json({ error: "当前账号没有执行该操作的权限" }, { status: 403 }), request);
    }
    const deniedUrl = new URL("/module-disabled", request.url);
    deniedUrl.searchParams.set("reason", "permission");
    deniedUrl.searchParams.set("route", pathname);
    if (search.includes("embed=1")) deniedUrl.searchParams.set("embed", "1");
    return applyEmbeddedCookie(NextResponse.redirect(deniedUrl), request, embedded);
  }

  return nextResponse(request, embedded);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
