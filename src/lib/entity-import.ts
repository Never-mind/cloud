import type { Row } from "./db";
import type { EntityConfig } from "./modules";

export type ImportFailure = {
  rowNumber: number;
  primaryKey: string;
  error: string;
};

export type ImportReport = {
  total: number;
  success: number;
  failed: ImportFailure[];
};

export async function importRowsWithReport(
  config: EntityConfig,
  rows: Row[],
  upsertRow: (row: Row) => Promise<void>,
): Promise<ImportReport> {
  const failed: ImportFailure[] = [];
  let success = 0;

  for (const [index, row] of rows.entries()) {
    try {
      await upsertRow(row);
      success += 1;
    } catch (error) {
      failed.push({
        rowNumber: index + 2,
        primaryKey: String(row[config.primaryKey] ?? ""),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { total: rows.length, success, failed };
}

export function buildImportMessage(report: ImportReport) {
  const lines = [`导入完成：共 ${report.total} 条，成功 ${report.success} 条，失败 ${report.failed.length} 条。`];

  if (report.failed.length) {
    lines.push("失败数据：");
    lines.push(
      ...report.failed.map((failure) =>
        `第 ${failure.rowNumber} 行${failure.primaryKey ? `（${failure.primaryKey}）` : ""}：${failure.error}`,
      ),
    );
  }

  return lines.join("\n");
}
