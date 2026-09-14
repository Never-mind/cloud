import { NextRequest } from "next/server";
import { buildCsvContent, csvFileResponse } from "@/lib/csv-export";
import { listMonthlyPrepaymentWriteOffs } from "@/lib/prepayment-service";
import {
  monthlyPrepaymentWriteOffColumns,
  monthlyPrepaymentWriteOffExportFilename,
} from "@/lib/writeoff-export-columns";

/** 服务端直接生成 CSV 文件下载，避免把大量行 JSON 传给浏览器再由前端拼文件。 */
export async function GET(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);
  params.set("export", "1");
  try {
    const data = await listMonthlyPrepaymentWriteOffs(params);
    return csvFileResponse(
      monthlyPrepaymentWriteOffExportFilename,
      buildCsvContent(data.rows, monthlyPrepaymentWriteOffColumns),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "预付款核销明细导出失败" },
      { status: 500 },
    );
  }
}
