import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { getPermissionStateForEmail } from "@/lib/permission-service";
import { hasPermission } from "@/lib/permission-definitions";
import { prepaymentFinanceSummaries } from "@/lib/prepayment-finance-service";
export async function POST(request: NextRequest) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email || !hasPermission(await getPermissionStateForEmail(email),"prepayment-contracts","view")) return NextResponse.json({error:"没有查看权限"},{status:403});
    const input = await request.json();
    if (!Array.isArray(input.contractNos)) throw new Error("缺少合同号列表");
    return NextResponse.json({ rows: await prepaymentFinanceSummaries(input.contractNos.map(String)) });
  } catch (error) { return NextResponse.json({error: error instanceof Error ? error.message : "汇总失败"},{status:400}); }
}
