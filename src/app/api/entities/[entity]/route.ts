import { NextRequest, NextResponse } from "next/server";
import { createEntityRow, getEntityRow, listEntityRows } from "@/lib/crud";
import { getEntityConfig } from "@/lib/modules";
import { getOperationActor, operationFields } from "@/lib/operation-actor";
import { recalculateQuotationSummary } from "@/lib/quotation-workflow";

export async function GET(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params;
  const config = getEntityConfig(entity);

  if (!config) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }

  const data = await listEntityRows(config, request.nextUrl.searchParams);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params;
  const config = getEntityConfig(entity);

  if (!config) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }

  try {
    const body = await request.json();
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
    if (entity === "quotation-items") {
      await recalculateQuotationSummary(String(row?.quotationId ?? auditedBody.quotationId ?? ""), actor);
    }
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存失败" },
      { status: 400 },
    );
  }
}
