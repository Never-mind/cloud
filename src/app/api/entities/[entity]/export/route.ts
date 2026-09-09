import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { listEntityRows } from "@/lib/crud";
import type { Row } from "@/lib/db";
import { getEntityConfig } from "@/lib/modules";
import { getOperationActorForLog, getOperationRequestId, recordOperationLog } from "@/lib/operation-log";
import { getPermissionDomainKey } from "@/lib/permission-definitions";

export async function GET(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params;
  const config = getEntityConfig(entity);

  if (!config) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }

  const params = new URLSearchParams(request.nextUrl.searchParams);
  params.set("page", "1");
  params.set("pageSize", "100");
  const rows: Row[] = [];
  let page = 1;
  let total = 0;
  do {
    params.set("page", String(page));
    const result = await listEntityRows(config, params);
    rows.push(...(result.rows as Row[]));
    total = result.total;
    page += 1;
  } while (rows.length < total);
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) =>
      Object.fromEntries(
        config.listFields.map((field) => [
          field.label,
          field.options?.find((option) => option.value === String(row[field.key] ?? ""))?.label ?? row[field.key] ?? "",
        ]),
      ),
    ),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, config.title);
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  await recordOperationLog({
    actor: await getOperationActorForLog(request),
    domainKey: getPermissionDomainKey(entity),
    moduleKey: entity,
    action: "export",
    entityType: config.key,
    requestId: getOperationRequestId(request),
    detail: { result: "success", rowCount: rows.length },
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${entity}-export.xlsx"`,
    },
  });
}
