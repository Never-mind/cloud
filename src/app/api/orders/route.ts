import { NextRequest, NextResponse } from "next/server";
import { listOrderFilterOptions, listOrderRows } from "@/lib/order-list-service";
import { BatchOrderDeleteValidationError, deleteRequestOrders } from "@/lib/order-delete-service";
import { getOperationActorForLog, getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("mode") && request.nextUrl.searchParams.get("field")) {
      return NextResponse.json(await listOrderFilterOptions(request.nextUrl.searchParams));
    }
    return NextResponse.json(await listOrderRows(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "订单列表加载失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求参数格式不正确" }, { status: 400 });
  }

  const body = payload && typeof payload === "object" ? payload as { mode?: unknown; ids?: unknown } : {};
  if (body.mode !== "requests") {
    return NextResponse.json({ error: "批量删除仅支持需求单" }, { status: 400 });
  }
  if (!Array.isArray(body.ids)) {
    return NextResponse.json({ error: "ids 必须是数组" }, { status: 400 });
  }

  const ids = [...new Set(body.ids.map((value) => String(value ?? "").trim()).filter(Boolean))];
  if (!ids.length) return NextResponse.json({ error: "请选择至少一条需求单" }, { status: 400 });
  if (ids.length > 100) return NextResponse.json({ error: "单次最多批量删除 100 条需求单" }, { status: 400 });

  try {
    const result = await deleteRequestOrders(ids);
    await recordOperationLog({
      actor: await getOperationActorForLog(request),
      domainKey: "power",
      moduleKey: "requests",
      action: "delete",
      entityType: "requests",
      entityId: ids.join(",").slice(0, 128),
      requestId: getOperationRequestId(request),
      detail: { result: "success", batch: true, deletedCount: result.deletedCount },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BatchOrderDeleteValidationError) {
      return NextResponse.json({ error: error.message, blocked: error.blocked }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "批量删除失败" }, { status: 500 });
  }
}
