import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { countPendingPurchaseItems, listPendingPurchaseItems } from "@/lib/pending-purchase-service";

/** 待采购明细：?count=1 只返回条数（给标签角标），否则返回分页列表。 */
export async function GET(request: NextRequest) {
  if (!getAuthenticatedUserEmail(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    if (request.nextUrl.searchParams.get("count") === "1") {
      return NextResponse.json({ total: await countPendingPurchaseItems() });
    }
    return NextResponse.json(await listPendingPurchaseItems(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "待采购明细加载失败" }, { status: 400 });
  }
}
