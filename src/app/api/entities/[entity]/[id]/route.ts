import { NextRequest, NextResponse } from "next/server";
import { deleteBillingLedger, updateBillingLedger } from "@/lib/billing-service";
import { deleteEntityRow, getEntityRow, updateEntityRow } from "@/lib/crud";
import { execute, type Row } from "@/lib/db";
import { getEntityConfig } from "@/lib/modules";
import { recalculateQuotationSummary } from "@/lib/quotation-workflow";
import { deletePurchaseOrder, deleteRequestOrder } from "@/lib/order-delete-service";
import { deleteCustomerPoDraft, deleteQuotationDraft } from "@/lib/po-document-delete-service";
import { deleteBillingStatementDraft } from "@/lib/billing-statement-service";
import { deletePrepaymentDraft } from "@/lib/prepayment-service";
import { deleteServiceFeeStatementDraft } from "@/lib/service-fee-service";
import { getOperationActor, operationFields, type OperationActor } from "@/lib/operation-actor";
import { assertPurchaseItemPowerPricingStorage, persistPurchaseItemPowerPricing, persistPurchaseOrderUsdRate } from "@/lib/purchase-power-pricing-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await context.params;
  const config = getEntityConfig(entity);

  if (!config) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }

  try {
    const row = await getEntityRow(config, id);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "详情加载失败" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await context.params;
  const config = getEntityConfig(entity);

  if (!config) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }

  if (["billing-statements", "service-fee-snapshots", "service-fee-snapshot-items", "prepayment-contracts"].includes(entity)) {
    return NextResponse.json({ error: "该单据不能通过通用编辑接口修改" }, { status: 400 });
  }

  const body = await request.json();
  if (entity === "purchase-order-items") {
    try {
      await assertPurchaseItemPowerPricingStorage(body);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "采购明细测算字段校验失败" }, { status: 400 });
    }
  }
  const actor = await getOperationActor(request);
  if (entity === "customer-pos") {
    try {
      const current = await getEntityRow(config, id);
      if (!current) return NextResponse.json({ error: "客户PO不存在" }, { status: 404 });
      if (String(current.status ?? "") === "confirmed") {
        return NextResponse.json({ error: "已确认的客户PO不能修改" }, { status: 400 });
      }
      if (String(body.status ?? current.status ?? "draft") === "confirmed") {
        return NextResponse.json({ error: "客户PO请通过确认操作确认，不能直接修改状态" }, { status: 400 });
      }
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "客户PO校验失败" }, { status: 400 });
    }
  }
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

  try {
    const before = entity === "purchase-orders" || entity === "quotation-items" ? await getEntityRow(config, id) : null;
    const auditedBody = ["requests", "purchase-orders", "customer-pos", "quotations", "history-quotations"].includes(entity)
      ? { ...body, ...operationFields(actor, "update") }
      : body;
    const row = await updateEntityRow(config, id, auditedBody);
    if (entity === "purchase-orders") await persistPurchaseOrderUsdRate(id, auditedBody);
    if (entity === "purchase-order-items") await persistPurchaseItemPowerPricing(id, auditedBody);
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
    if (entity === "quotation-items") {
      const previousQuotationId = String(before?.quotationId ?? "").trim();
      const nextQuotationId = String(row?.quotationId ?? auditedBody.quotationId ?? "").trim();
      if (previousQuotationId && previousQuotationId !== nextQuotationId) {
        await recalculateQuotationSummary(previousQuotationId, actor);
      }
      if (nextQuotationId) {
        await recalculateQuotationSummary(nextQuotationId, actor);
      }
    }
    if (entity === "quotations") {
      await recalculateQuotationSummary(id, actor);
    }
    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存失败" },
      { status: 400 },
    );
  }
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

  let actor: OperationActor | null = null;
  let before: Row | null = null;
  try {
    actor = await getOperationActor(_request);
    before = entity === "quotation-items" ? await getEntityRow(config, id) : null;
    if (entity === "billing-statements") {
      await deleteBillingStatementDraft(id);
      return NextResponse.json({ ok: true });
    }
    if (entity === "service-fee-snapshots") {
      await deleteServiceFeeStatementDraft(id);
      return NextResponse.json({ ok: true });
    }
    if (entity === "service-fee-snapshot-items") {
      return NextResponse.json({ error: "服务费对账单明细只能随未确认主单删除" }, { status: 400 });
    }
    if (entity === "prepayment-contracts") {
      await deletePrepaymentDraft(id);
      return NextResponse.json({ ok: true });
    }
    if (entity === "requests") {
      await deleteRequestOrder(id);
      return NextResponse.json({ ok: true });
    }
    if (entity === "purchase-orders") {
      await deletePurchaseOrder(id);
      return NextResponse.json({ ok: true });
    }
    if (entity === "customer-pos") {
      await deleteCustomerPoDraft(id);
      return NextResponse.json({ ok: true });
    }
    if (entity === "quotations") {
      await deleteQuotationDraft(id);
      return NextResponse.json({ ok: true });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: 400 },
    );
  }

  await deleteEntityRow(config, id);
  if (entity === "quotation-items") {
    const quotationId = String(before?.quotationId ?? "").trim();
    if (quotationId) {
      await recalculateQuotationSummary(quotationId, actor);
    }
  }
  return NextResponse.json({ ok: true });
}
