import * as XLSX from "xlsx";

export type ClientExportColumn = {
  key: string;
  label: string;
  format?: (value: unknown) => string | number;
};

export function exportRowsToXlsx({
  columns,
  fileName,
  rows,
  sheetName,
}: {
  columns: ClientExportColumn[];
  fileName: string;
  rows: Array<Record<string, unknown>>;
  sheetName: string;
}) {
  const worksheet = XLSX.utils.aoa_to_sheet([
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => column.format ? column.format(row[column.key]) : String(row[column.key] ?? ""))),
  ]);
  worksheet["!cols"] = columns.map((column) => ({ wch: Math.max(12, column.label.length * 2 + 4) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}
