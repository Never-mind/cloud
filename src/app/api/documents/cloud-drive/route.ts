import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserEmail } from "@/lib/auth";
import { listCloudDrive } from "@/lib/cloud-drive-service";
import { getPermissionStateForEmail } from "@/lib/permission-service";

/** 文档库 → 云盘目录：按统一目录规则汇总各模块附件（含"还在数据库里"的）。 */
export async function GET(request: NextRequest) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const viewer = await getPermissionStateForEmail(email);
    const params = request.nextUrl.searchParams;
    const result = await listCloudDrive({
      keyword: params.get("keyword") ?? "",
      prefix: params.get("prefix") ?? "",
      viewer,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "云盘目录加载失败" }, { status: 500 });
  }
}
