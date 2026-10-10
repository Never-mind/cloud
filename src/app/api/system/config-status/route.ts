import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { resolveFrappeEndpoint } from "@/lib/frappe-config";
import { feishuAutoProvisionEnabled, isFeishuLoginEnabled } from "@/lib/feishu-auth-config";
import { isObsEnabled, resolveObsConfig } from "@/lib/obs-config";

/**
 * 部署自检：各外部依赖的配置是否就绪。
 *
 * 换服务器、改 `.env.local` 之后打开这个地址就能看出哪一项没配好，
 * 不用逐个功能去试。只回"是否配置 + 地址/桶名"，**不回密钥**，并要求登录。
 */
export async function GET(request: NextRequest) {
  if (!getAuthenticatedUserEmail(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let frappe: { configured: boolean; baseUrl: string } = { configured: false, baseUrl: "" };
  try {
    const endpoint = resolveFrappeEndpoint("需求数据");
    frappe = { configured: Boolean(endpoint.token), baseUrl: endpoint.baseUrl };
  } catch {
    frappe = { configured: false, baseUrl: "" };
  }

  let obs: { enabled: boolean; bucket: string; prefix: string; note?: string } = { enabled: false, bucket: "", prefix: "" };
  try {
    const config = resolveObsConfig();
    obs = { enabled: isObsEnabled(), bucket: config?.bucket ?? "", prefix: config?.prefix ?? "" };
  } catch (error) {
    obs = { enabled: false, bucket: "", prefix: "", note: error instanceof Error ? error.message : "OBS 配置不完整" };
  }

  return NextResponse.json({
    frappe: {
      ...frappe,
      hint: frappe.configured ? undefined : "缺 FRAPPE_API_TOKEN（兼容旧名 MATERIAL_API_TOKEN）",
    },
    obs: {
      ...obs,
      hint: obs.enabled ? undefined : "未启用 OBS：附件内容会存进数据库（功能可用，只是库会变大）",
    },
    feishu: {
      loginEnabled: isFeishuLoginEnabled(),
      autoProvision: feishuAutoProvisionEnabled(),
      hint: isFeishuLoginEnabled() ? undefined : "缺 FEISHU_APP_ID / FEISHU_APP_SECRET，登录页会提示「飞书登录尚未配置」",
    },
    crm: {
      configured: Boolean((process.env.CRM_API_BASE_URL ?? "").trim() && (process.env.CRM_API_TOKEN ?? "").trim()),
      baseUrl: (process.env.CRM_API_BASE_URL ?? "").trim(),
      hint: (process.env.CRM_API_BASE_URL ?? "").trim() && (process.env.CRM_API_TOKEN ?? "").trim()
        ? undefined
        : "缺 CRM_API_BASE_URL / CRM_API_TOKEN，华为云「账期发票（CRM）」同步不可用",
    },
  });
}
