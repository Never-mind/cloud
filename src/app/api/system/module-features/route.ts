import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import {
  encodeModuleFeatureState,
  MODULE_FEATURE_COOKIE_NAME,
} from "@/lib/module-feature-definitions";
import { listModuleFeatures, updateModuleFeature } from "@/lib/module-feature-service";

function applyFeatureCookie(response: NextResponse, state: Record<string, boolean>, request: NextRequest) {
  response.cookies.set(MODULE_FEATURE_COOKIE_NAME, encodeModuleFeatureState(state), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const data = await listModuleFeatures(email);
    return applyFeatureCookie(NextResponse.json(data), data.state, request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取功能模块配置失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const data = await updateModuleFeature(email, String(body.moduleKey ?? ""), body.enabled === true);
    return applyFeatureCookie(NextResponse.json(data), data.state, request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新功能模块配置失败" }, { status: 400 });
  }
}
