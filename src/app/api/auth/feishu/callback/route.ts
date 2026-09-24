import { NextRequest, NextResponse } from "next/server";

import { getUserByEmail } from "@/lib/auth";
import { applyLoginCookies } from "@/lib/auth-login-cookies";
import { resolveFeishuRedirectUri } from "@/lib/feishu-auth-config";
import {
  exchangeFeishuCode,
  fetchFeishuProfile,
  readNextFromState,
  resolveFeishuLoginUser,
  verifyFeishuState,
} from "@/lib/feishu-auth-service";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

/**
 * 飞书授权回调：校验 state → code 换用户令牌 → 读飞书用户信息 → 落到本地账号 → 下发会话 cookie。
 * 失败一律回到登录页并带上原因，不泄露内部细节。
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  const next = readNextFromState(state);
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, request.nextUrl.origin));

  if (!state || !verifyFeishuState(state)) return fail("登录会话已过期，请重新发起飞书登录");
  if (!code) {
    const remoteError = params.get("error_description") ?? params.get("error") ?? "";
    return fail(remoteError ? `飞书授权未完成：${remoteError}` : "飞书授权未完成，请重试");
  }

  try {
    const redirectUri = resolveFeishuRedirectUri(request);
    const accessToken = await exchangeFeishuCode({ code, redirectUri });
    const profile = await fetchFeishuProfile(accessToken);
    const result = await resolveFeishuLoginUser(profile);

    if (!result.ok) {
      await recordOperationLog({
        domainKey: "common",
        moduleKey: "auth",
        action: "login",
        entityType: "user",
        entityId: profile.email || profile.openId,
        requestId: getOperationRequestId(request),
        detail: { result: "failed", method: "feishu", reason: result.reason },
      });
      return fail(result.reason);
    }

    const user = await getUserByEmail(result.email);
    await recordOperationLog({
      actor: user,
      domainKey: "common",
      moduleKey: "auth",
      action: "login",
      entityType: "user",
      entityId: result.userId,
      requestId: getOperationRequestId(request),
      detail: { result: "success", method: "feishu", firstBind: result.bound },
    });
    const response = NextResponse.redirect(new URL(next, request.nextUrl.origin));
    await applyLoginCookies(response, request, result.email);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "飞书登录失败";
    await recordOperationLog({
      domainKey: "common",
      moduleKey: "auth",
      action: "login",
      entityType: "user",
      entityId: null,
      requestId: getOperationRequestId(request),
      detail: { result: "failed", method: "feishu", reason: message },
    }).catch(() => undefined);
    return fail(message);
  }
}
