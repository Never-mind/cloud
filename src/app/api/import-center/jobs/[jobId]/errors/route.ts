import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getImportJob } from "@/lib/import-center-service";

type FailureRow = {
  rowNumber?: number;
  primaryKey?: string;
  error?: string;
};

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = await getImportJob(decodeURIComponent(jobId));
  if (!job) return NextResponse.json({ error: "导入任务不存在" }, { status: 404 });

  const report = JSON.parse(String(job.reportJson || "{}"));
  const failed: FailureRow[] = Array.isArray(report.failed) ? report.failed : [];
  const rows = failed.length
    ? failed.map((item) => ({
        行号: item.rowNumber || "",
        主键: item.primaryKey || "",
        错误原因: item.error || "",
      }))
    : [{ 行号: "", 主键: "", 错误原因: "无失败数据" }];

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 80 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "错误报告");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${jobId}-errors.xlsx"`,
    },
  });
}
