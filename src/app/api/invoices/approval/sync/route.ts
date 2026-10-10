import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { queryRows } from "@/lib/db";
import { syncInvoiceApproval } from "@/lib/feishu-approval-service";

/**
 * 手动同步飞书审批状态。
 *
 * 定时任务（`npm run feishu:approval-sync`）是主要通道，这里是给用户的即时入口：
 * 在飞书里撤回 / 被驳回 / 审批通过之后，不必等下一轮轮询就能把状态拉回来。
 */
export async function POST(request: NextRequest) {
  if (!getAuthenticatedUserEmail(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    const rows = await queryRows<{ instanceCode: string }>(
      `SELECT instanceCode FROM merge_common_feishu_approvals
        WHERE status = 'pending' OR (status = 'approved' AND (invoiceId IS NULL OR invoiceId = ''))
        ORDER BY submittedAt ASC LIMIT 20`,
    );
    let updated = 0;
    const errors: string[] = [];
    for (const row of rows) {
      try {
        await syncInvoiceApproval(row.instanceCode);
        updated += 1;
      } catch (error) {
        errors.push(`${row.instanceCode}: ${error instanceof Error ? error.message : error}`);
      }
    }
    return NextResponse.json({ checked: rows.length, updated, errors });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "同步飞书审批状态失败" }, { status: 400 });
  }
}
