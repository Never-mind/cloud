import { NextRequest, NextResponse } from "next/server";
import { deleteBillingLedger, updateBillingLedger } from "@/lib/billing-service";
import { deleteEntityRow, getEntityRow, updateEntityRow } from "@/lib/crud";
import { execute } from "@/lib/db";
import { getEntityConfig } from "@/lib/modules";
import { deletePurchaseOrder, deleteRequestOrder } from "@/lib/order-delete-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await context.params;
  const config = getEntityConfig(entity);

  if (!config) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }

  const row = await getEntityRow(config, id);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await context.params;
  const config = getEntityConfig(entity);

  if (!config) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }

  const body = await request.json();
  if (entity === "billing-ledgers") {
    try {
      const row = await updateBillingLedger(id, body);
      return NextResponse.json(row);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "月账单台账更新失败" },
        { status: 400 },
      );
    }
  }

  const before = entity === "purchase-orders" ? await getEntityRow(config, id) : null;
  const row = await updateEntityRow(config, id, body);
  if (entity === "purchase-orders" && before && body.poNo && String(before.poNo ?? "") !== String(body.poNo)) {
    await execute("UPDATE purchaseorderitems SET poNo = :poNo WHERE purchaseOrderId = :purchaseOrderId", {
      poNo: body.poNo,
      purchaseOrderId: id,
    });
    await execute("UPDATE shipments SET poNo = :poNo WHERE poNo = :oldPoNo", {
      poNo: body.poNo,
      oldPoNo: before.poNo,
    });
  }
  return NextResponse.json(row);
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await context.params;
  const config = getEntityConfig(entity);

  if (!config) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }

  if (entity === "billing-ledgers") {
    await deleteBillingLedger(id);
    return NextResponse.json({ ok: true });
  }

  try {
    if (entity === "requests") {
      await deleteRequestOrder(id);
      return NextResponse.json({ ok: true });
    }
    if (entity === "purchase-orders") {
      await deletePurchaseOrder(id);
      return NextResponse.json({ ok: true });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: 400 },
    );
  }

  await deleteEntityRow(config, id);
  return NextResponse.json({ ok: true });
}
