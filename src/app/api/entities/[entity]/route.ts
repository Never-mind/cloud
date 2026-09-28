import { NextRequest, NextResponse } from "next/server";
import { createEntityRow, getEntityRow, listEntityRows } from "@/lib/crud";
import { getEntityConfig } from "@/lib/modules";
import { getOperationActor, operationFields } from "@/lib/operation-actor";
import { recalculateQuotationSummary } from "@/lib/quotation-workflow";
import { assertPurchaseItemPowerPricingStorage, persistPurchaseItemPowerPricing, persistPurchaseOrderUsdRate } from "@/lib/purchase-power-pricing-service";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";
import { getPermissionDomainKey } from "@/lib/permission-definitions";

export async function GET(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params;
  const config = getEntityConfig(entity);

  if (!config) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }
  /**
   * 发票汇总、待生成预付款这类模块的数据由专用接口提供（带各自的业务过滤与聚合），
   * 通用实体接口取不到正确口径；这里直接给明确提示，避免以前那种暴露 SQL 报错的 500。
   */
  if (config.genericListDisabled) {
    return NextResponse.json({ error: `${config.title} 使用专用接口，请通过对应页面查询` }, { status: 400 });
  }

  try {
    const data = await listEntityRows(config, request.nextUrl.searchParams);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "列表加载失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params;
  const config = getEntityConfig(entity);

  if (!config) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }

  try {
    const body = await request.json();
    if (entity === "purchase-order-items") await assertPurchaseItemPowerPricingStorage(body);
    if (entity === "customer-pos" && String(body.status ?? "draft") === "confirmed") {
      return NextResponse.json({ error: "客户PO请通过确认操作确认，不能直接修改状态" }, { status: 400 });
    }
    const actor = await getOperationActor(request);
    const auditedBody = ["requests", "purchase-orders", "customer-pos", "quotations", "history-quotations"].includes(entity)
      ? { ...body, ...operationFields(actor, "create") }
      : body;
    if (entity === "quotation-items") {
      const quotationId = String(auditedBody.quotationId ?? "").trim();
      if (!quotationId) {
        return NextResponse.json({ error: "报价单ID不能为空" }, { status: 400 });
      }
      const quotation = await getEntityRow(getEntityConfig("quotations")!, quotationId);
      if (!quotation) {
        return NextResponse.json({ error: "报价单不存在" }, { status: 400 });
      }
    }
    const row = await createEntityRow(config, auditedBody);
    if (entity === "purchase-orders") await persistPurchaseOrderUsdRate(String(row?.purchaseOrderId ?? auditedBody.purchaseOrderId ?? ""), auditedBody);
    if (entity === "purchase-order-items") await persistPurchaseItemPowerPricing(String(row?.id ?? auditedBody.id ?? ""), auditedBody);
    if (entity === "quotation-items") {
      await recalculateQuotationSummary(String(row?.quotationId ?? auditedBody.quotationId ?? ""), actor);
    }
    await recordOperationLog({
      actor,
      domainKey: getPermissionDomainKey(entity),
      moduleKey: entity,
      action: "create",
      entityType: config.key,
      entityId: String(row?.[config.primaryKey] ?? auditedBody[config.primaryKey] ?? "") || null,
      requestId: getOperationRequestId(request),
      detail: { result: "success" },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存失败" },
      { status: 400 },
    );
  }
}
