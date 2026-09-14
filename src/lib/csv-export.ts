import type { Row } from "./db";
import { formatDisplayValue } from "./display-format";
import type { WriteOffColumn } from "./writeoff-export-columns";

/**
 * 服务端导出 CSV 内容。
 *
 * 与页面表格使用同一份列定义和同一个格式化函数（formatDisplayValue），
 * 保证导出文件与界面看到的一致；带 UTF-8 BOM，Excel 直接打开不乱码。
 */
export function buildCsvContent(rows: Row[], columns: WriteOffColumn[]) {
  const lines = [
    columns.map((column) => escapeCsv(column.label)).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(formatDisplayValue(row[column.key] as never, column.type))).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function csvFileResponse(filename: string, content: string) {
  return new Response(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function escapeCsv(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}
