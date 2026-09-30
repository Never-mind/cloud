import { NextRequest, NextResponse } from "next/server";
import { getOperationActor } from "@/lib/operation-actor";
import { deleteCrmCustomerMapping, saveCrmCustomerMapping } from "@/lib/crm-invoice-sync-service";

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await saveCrmCustomerMapping(await request.json(), await getOperationActor(request)), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "映射保存失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "缺少映射ID" }, { status: 400 });
    return NextResponse.json(await deleteCrmCustomerMapping(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "映射删除失败" }, { status: 400 });
  }
}
