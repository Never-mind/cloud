import { NextRequest, NextResponse } from "next/server";
import { execute, queryRows, type Row } from "@/lib/db";
import { getOperationActor } from "@/lib/operation-actor";

export async function POST(request: NextRequest, context: { params: Promise<{ poId: string }> }) {
  const { poId } = await context.params;
  const id = decodeURIComponent(poId);
  const rows = await queryRows<Row>("SELECT id, poNo, status FROM po_customer_pos WHERE id = :id LIMIT 1", { id });
  const current = rows[0];
  if (!current) return NextResponse.json({ error: "客户PO不存在" }, { status: 404 });
  if (String(current.status ?? "") === "confirmed") return NextResponse.json({ error: "客户PO已经确认" }, { status: 400 });

  const actor = await getOperationActor(request);
  if (!actor) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  await execute(
    `UPDATE po_customer_pos
        SET status = 'confirmed',
            confirmedByUserId = :confirmedByUserId,
            confirmedByName = :confirmedByName,
            confirmedAt = CURRENT_TIMESTAMP,
            updatedByUserId = :updatedByUserId,
            updatedByName = :updatedByName
      WHERE id = :id AND status <> 'confirmed'`,
    {
      id,
      confirmedByUserId: actor.userId,
      confirmedByName: actor.displayName,
      updatedByUserId: actor.userId,
      updatedByName: actor.displayName,
    },
  );
  return NextResponse.json({ ok: true, poNo: current.poNo, confirmedByName: actor.displayName });
}
