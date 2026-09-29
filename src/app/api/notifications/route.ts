import { NextRequest, NextResponse } from "next/server";
import { countUnreadNotifications, listMyNotifications, markNotificationsRead } from "@/lib/notification-service";
import { getOperationActor } from "@/lib/operation-actor";

export async function GET(request: NextRequest) {
  try {
    const actor = await getOperationActor(request);
    if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
    const [items, unread] = await Promise.all([
      listMyNotifications(actor.userId, limit),
      countUnreadNotifications(actor.userId),
    ]);
    return NextResponse.json({ items, unread });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "加载消息失败" }, { status: 500 });
  }
}

/** 标记已读：带 ids 只标这几条，不带则全部标记已读。 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getOperationActor(request);
    if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.map((value) => String(value ?? "")).filter(Boolean) : undefined;
    await markNotificationsRead(actor.userId, ids);
    return NextResponse.json({ ok: true, unread: await countUnreadNotifications(actor.userId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "标记已读失败" }, { status: 400 });
  }
}
