import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { getPermissionStateForEmail } from "@/lib/permission-service";
import { hasPermission } from "@/lib/permission-definitions";
import { getPrepaymentFinance, savePrepaymentSettings, savePrepaymentReceipt, voidPrepaymentReceipt } from "@/lib/prepayment-finance-service";
import { recordOperationLog } from "@/lib/operation-log";
import type { ReceiptInput } from "@/lib/prepayment-finance";
type Context = { params: Promise<{ contractNo: string }> };
async function access(request: NextRequest, action: "view" | "update") {
  const email = getAuthenticatedUserEmail(request);
  if (!email) throw new Error("未登录");
  const state = await getPermissionStateForEmail(email);
  if (!hasPermission(state,"prepayment-contracts",action)) throw new Error("当前账号没有预付款合同的操作权限");
  return email;
}
const failure = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : "预付款财务操作失败" }, { status: 400 });
export async function GET(request: NextRequest, context: Context) {
  try { await access(request,"view"); return NextResponse.json(await getPrepaymentFinance((await context.params).contractNo)); } catch(error) { return failure(error); }
}
export async function PUT(request: NextRequest, context: Context) {
  try {
    const actor = await access(request,"update"); const contractNo = (await context.params).contractNo;
    const input = await request.json(); await savePrepaymentSettings(contractNo,input);
    await recordOperationLog({ moduleKey: "prepayment-contracts", action: "finance_settings", entityId: contractNo, detail: { actor, ...input } });
    return NextResponse.json(await getPrepaymentFinance(contractNo));
  } catch(error) { return failure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const actor = await access(request,"update"); const contractNo = (await context.params).contractNo;
    const input = await request.json() as ReceiptInput;
    const id = await savePrepaymentReceipt(contractNo,input,actor);
    await recordOperationLog({ moduleKey: "prepayment-contracts", action: "save_receipt", entityId: String(id), detail: { actor, contractNo, ...input } });
    return NextResponse.json({ id });
  } catch(error) { return failure(error); }
}
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const actor = await access(request,"update"); const contractNo = (await context.params).contractNo;
    const input = await request.json();
    await voidPrepaymentReceipt(contractNo,String(input.id),Number(input.version),String(input.reason || ""),actor);
    await recordOperationLog({ moduleKey: "prepayment-contracts", action: "void_receipt", entityId: String(input.id), detail: { actor, contractNo, reason: input.reason } });
    return NextResponse.json({ ok: true });
  } catch(error) { return failure(error); }
}
