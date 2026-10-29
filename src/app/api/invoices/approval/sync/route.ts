import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { queryRows } from "@/lib/db";
import { syncInvoiceApproval, syncPendingInvoiceApprovals } from "@/lib/feishu-approval-service";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";

/**
 * 手动同步飞书审批状态。
 *
 * 服务内置轮询自动执行，这里是给用户的即时入口：
 * 在飞书里撤回 / 被驳回 / 审批通过之后，不必等下一轮轮询就能把状态拉回来。
 */
export async function POST(request: NextRequest) {
  if (!getAuthenticatedUserEmail(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    const email = getAuthenticatedUserEmail(request)!;
    if (!hasPermission(await getPermissionStateForEmail(email), "invoices", "create")) return NextResponse.json({ error: "没有发票管理的操作权限" }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    if (body.instanceCode) {
      const result = await syncInvoiceApproval(String(body.instanceCode));
      const [record] = await queryRows("SELECT syncError FROM merge_common_feishu_approvals WHERE instanceCode = :instanceCode LIMIT 1", { instanceCode: String(body.instanceCode) });
      return NextResponse.json({ checked: 1, updated: Number(result.changed), errors: record?.syncError ? [String(record.syncError)] : [] });
    }
    const result = await syncPendingInvoiceApprovals(20);
    return NextResponse.json({ ...result, errors: result.errors.map(item => `${item.instanceCode}: ${item.error}`) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "同步飞书审批状态失败" }, { status: 400 });
  }
}
