import { NextRequest, NextResponse } from "next/server";
import {
  isCostPaymentBranch,
  loadUserFeishuOpenId,
  submitCostPaymentApproval,
  type CostPaymentEntryInput,
} from "@/lib/cost-payment-approval-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";
import { getPermissionDomainKey } from "@/lib/permission-definitions";

const MODULE_KEY_BY_BRANCH = {
  huawei: "huawei-cloud-supplier-payments",
  other: "po-invoice-summary",
  compute: "purchase-orders",
} as const;

/** 发起成本款付款申请（飞书审批）。 */
export async function POST(request: NextRequest, context: { params: Promise<{ branch: string }> }) {
  const { branch } = await context.params;
  if (!isCostPaymentBranch(branch)) {
    return NextResponse.json({ error: "未知的付款申请分支" }, { status: 400 });
  }
  const actor = await getOperationActor(request);
  if (!actor) return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const entries = Array.isArray(body?.entries) ? (body.entries as CostPaymentEntryInput[]) : [];
  try {
    const openId = await loadUserFeishuOpenId(actor.userId);
    const result = await submitCostPaymentApproval({
      branch,
      reason: String(body?.reason ?? "").trim() || "支付成本款",
      entries,
      starter: { openId, userId: actor.userId, displayName: actor.displayName },
    });
    await recordOperationLog({
      actor,
      domainKey: getPermissionDomainKey(MODULE_KEY_BY_BRANCH[branch]),
      moduleKey: MODULE_KEY_BY_BRANCH[branch],
      action: "confirm",
      entityType: "cost-payment-approval",
      entityId: result.instanceCode,
      requestId: getOperationRequestId(request),
      detail: { result: "success", branch, count: entries.length },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发起付款申请失败" },
      { status: 400 },
    );
  }
}

