import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getEntityConfig } from "@/lib/modules";

export async function GET(_request: Request, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params;
  const config = getEntityConfig(entity);

  if (!config) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }

  const worksheet = XLSX.utils.json_to_sheet([Object.fromEntries(config.formFields.map((field) => [field.label, ""]))]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, config.title);
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${entity}-template.xlsx"`,
    },
  });
}
