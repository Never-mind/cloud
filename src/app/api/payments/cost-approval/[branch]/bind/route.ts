import { NextRequest, NextResponse } from "next/server";
import { bindCostPaymentApproval, isCostPaymentBranch } from "@/lib/cost-payment-approval-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";
import { getPermissionDomainKey } from "@/lib/permission-definitions";

const MODULE_KEY_BY_BRANCH = {
  huawei: "huawei-cloud-supplier-payments",
  other: "po-invoice-summary",
  compute: "purchase-orders",
} as const;

/** 绑定外部发起的成本款付款审批，并同步“确认是否到账”节点时间。 */
export async function POST(request: NextRequest, context: { params: Promise<{ branch: string }> }) {
  const { branch } = await context.params;
  if (!isCostPaymentBranch(branch)) {
    return NextResponse.json({ error: "未知的付款申请分支" }, { status: 400 });
  }
  const actor = await getOperationActor(request);
  if (!actor) return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const ownerIds = Array.isArray(body?.ownerIds) ? body.ownerIds.map((value: unknown) => String(value ?? "")) : [];
  try {
    const result = await bindCostPaymentApproval({
      branch,
      ownerIds,
      instanceCodeOrSerial: String(body?.instanceCode ?? ""),
    });
    await recordOperationLog({
      actor,
      domainKey: getPermissionDomainKey(MODULE_KEY_BY_BRANCH[branch]),
      moduleKey: MODULE_KEY_BY_BRANCH[branch],
      action: "confirm",
      entityType: "cost-payment-approval-bind",
      entityId: result.instanceCode,
      requestId: getOperationRequestId(request),
      detail: { result: "success", branch, ownerIds: result.ownerIds },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "绑定审批失败" },
      { status: 400 },
    );
  }
}
