import { NextRequest, NextResponse } from "next/server";
import { listCloudSupplierPayments } from "@/lib/cloud-service";

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listCloudSupplierPayments(request.nextUrl.searchParams)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "供应商付款加载失败" }, { status: 500 }); }
}
