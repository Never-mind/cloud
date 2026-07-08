import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { upsertEntityRow } from "@/lib/crud";
import { importRowsWithReport } from "@/lib/entity-import";
import { getEntityConfig } from "@/lib/modules";

export async function POST(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params;
  const config = getEntityConfig(entity);

  if (!config) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
  const fieldByLabel = new Map(config.formFields.map((field) => [field.label, field.key]));
  const mappedRows = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .map(([label, value]) => [fieldByLabel.get(label) ?? label, value])
        .filter(([field]) => config.formFields.some((item) => item.key === field)),
    ),
  );

  const report = await importRowsWithReport(config, mappedRows, (row) => upsertEntityRow(config, row));
  return NextResponse.json(report);
}
