import { NextRequest, NextResponse } from "next/server";
import { createEntityRow, listEntityRows } from "@/lib/crud";
import { getEntityConfig } from "@/lib/modules";

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
    const row = await createEntityRow(config, body);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存失败" },
      { status: 400 },
    );
  }
}
