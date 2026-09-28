import { NextRequest, NextResponse } from "next/server";

import { isFeishuLoginEnabled, resolveFeishuRedirectUri } from "@/lib/feishu-auth-config";
import { buildFeishuAuthorizeUrl, createFeishuState } from "@/lib/feishu-auth-service";
import { resolveRequestOrigin, safeInternalPath } from "@/lib/request-origin";

/**
 * 飞书登录入口：校验配置 → 生成带签名 state 的授权地址 → 302 到飞书授权页。
 * 登录页的「使用飞书登录」按钮直接指向这里。
 */
export async function GET(request: NextRequest) {
  // 跳转地址必须按真实请求头拼，不能用 nextUrl.origin（会变成 localhost 导致跨主机跳转丢会话）。
  const origin = resolveRequestOrigin(request);
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));
  if (!isFeishuLoginEnabled()) {
    return NextResponse.redirect(new URL("/login?error=feishu_not_configured", origin));
  }
  try {
    const redirectUri = resolveFeishuRedirectUri(request);
    const state = `${createFeishuState()}.${Buffer.from(next, "utf8").toString("base64url")}`;
    return NextResponse.redirect(buildFeishuAuthorizeUrl({ redirectUri, state }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "飞书登录发起失败";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin));
  }
}
