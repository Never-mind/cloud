import { NextRequest, NextResponse } from "next/server";
import {
  deletePrepaymentDraft,
  getPrepaymentContract,
  updatePrepaymentDraft,
} from "@/lib/prepayment-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ contractNo: string }> }) {
  const { contractNo } = await context.params;
  const data = await getPrepaymentContract(decodeURIComponent(contractNo));
  if (!data.contract) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ contractNo: string }> }) {
  try {
    const { contractNo } = await context.params;
    const body = await request.json();
    const data = await updatePrepaymentDraft({
      contractNo: decodeURIComponent(contractNo),
      effectiveDate: String(body.effectiveDate ?? new Date().toISOString().slice(0, 10)),
      lines: Array.isArray(body.lines) ? body.lines : [],
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ contractNo: string }> }) {
  try {
    const { contractNo } = await context.params;
    await deletePrepaymentDraft(decodeURIComponent(contractNo));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 400 });
  }
}
