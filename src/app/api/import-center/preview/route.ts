import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getImportTarget, isImportTemplateNoteRow, type ImportStrategy, type ImportTargetKey } from "@/lib/import-center";
import { createImportPreviewJob } from "@/lib/import-center-service";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const targetKey = String(formData.get("targetKey") ?? "") as ImportTargetKey;
    const strategy = String(formData.get("strategy") ?? "overwrite-drafts") as ImportStrategy;
    const file = formData.get("file");
    const target = getImportTarget(targetKey);

    if (!target) return NextResponse.json({ error: "未知导入类型" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "请上传 Excel 文件" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: "",
      raw: false,
    });
    const dataRows = rows.filter((row) => !isImportTemplateNoteRow(row));
    const preview = await createImportPreviewJob({
      targetKey,
      strategy,
      rows: dataRows,
      fileName: file.name,
    });

    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

function isNoteRow(row: Record<string, unknown>) {
  const values = Object.values(row).map((value) => String(value ?? ""));
  return values.some((value) => value === "必填" || value.includes("/") || value.includes("为空默认"));
}
