import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getOperationActor } from "@/lib/operation-actor";
import { importUnpurchasedSettlementItems } from "@/lib/settlement-project-service";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择要导入的Excel文件" }, { status: 400 });
  if (!/\.xlsx?$/i.test(file.name)) return NextResponse.json({ error: "仅支持xlsx或xls文件" }, { status: 400 });

  try {
    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { cellDates: true });
    const sheetName = workbook.SheetNames.includes("未采购商品") ? "未采购商品" : workbook.SheetNames[0];
    const worksheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!worksheet) return NextResponse.json({ error: "工作簿没有可导入的工作表" }, { status: 400 });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: false })
      .filter((row) => Object.values(row).some((value) => String(value ?? "").trim()))
      .filter((row) => !String(row["明细ID"] ?? "").trim().includes("系统明细ID"));
    if (!rows.length) return NextResponse.json({ error: "导入文件没有有效数据" }, { status: 400 });
    const projectId = decodeURIComponent((await context.params).id);
    const actor = await getOperationActor(request);
    const result = await importUnpurchasedSettlementItems(projectId, rows, actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "import", entityType: "settlement-items", entityId: projectId, requestId: getOperationRequestId(request), detail: { result: "success", fileName: file.name, total: result.total, success: result.success, failed: result.failed.length } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "未采购商品导入失败" }, { status: 400 });
  }
}
