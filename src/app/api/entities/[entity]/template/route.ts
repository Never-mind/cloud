import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getEntityConfig } from "@/lib/modules";

export async function GET(_request: Request, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params;
  const config = getEntityConfig(entity);

  if (!config) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }

  const templateFields = config.formFields.filter((field) => !field.hidden);
  const headers = Object.fromEntries(templateFields.map((field) => [field.label, ""]));
  const notes = Object.fromEntries(
    templateFields.map((field) => [
      field.label,
      field.required
        ? `必填${field.type ? `：${getTypeLabel(field.type)}` : ""}`
        : `可选${field.type ? `：${getTypeLabel(field.type)}` : ""}`,
    ]),
  );
  const worksheet = XLSX.utils.json_to_sheet([headers, notes], { skipHeader: false });
  // Keep codes such as 001234 as text when users fill the template in Excel.
  templateFields.forEach((field, columnIndex) => {
    if (field.type === "number" || field.type === "date" || field.type === "datetime" || field.type === "boolean") {
      return;
    }
    const cell = XLSX.utils.encode_cell({ r: 2, c: columnIndex });
    worksheet[cell] = { t: "s", v: "", z: "@" };
  });
  worksheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 2, c: templateFields.length - 1 } });
  worksheet["!cols"] = templateFields.map((field) => ({
    wch: Math.max(14, field.label.length + 8),
  }));
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

function getTypeLabel(type: string) {
  if (type === "number") return "数字";
  if (type === "money") return "金额（两位小数）";
  if (type === "percentage") return "百分比";
  if (type === "date") return "日期";
  if (type === "datetime") return "日期时间";
  if (type === "boolean") return "是/否";
  if (type === "textarea") return "文本";
  return "文本";
}
