import { NextRequest, NextResponse } from "next/server";

import { isFeishuLoginEnabled, resolveFeishuRedirectUri } from "@/lib/feishu-auth-config";

/**
 * 返回当前访问地址下实际会使用的飞书回调地址。
 *
 * 飞书授权返回 20029（重定向 URL 有误）时，需要把这里输出的地址**原样**填进
 * 飞书开放平台的「安全设置 → 重定向 URL」，所以登录页直接把它显示出来，
 * 避免用户猜 localhost / 127.0.0.1 / 端口 的差异。
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    enabled: isFeishuLoginEnabled(),
    redirectUri: resolveFeishuRedirectUri(request),
  });
}
