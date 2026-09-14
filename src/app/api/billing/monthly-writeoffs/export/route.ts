import { NextRequest } from "next/server";
import { buildCsvContent, csvFileResponse } from "@/lib/csv-export";
import { listMonthlyBillingWriteOffs } from "@/lib/billing-service";
import {
  monthlyBillingWriteOffDisplayColumns,
  monthlyBillingWriteOffExportFilename,
} from "@/lib/writeoff-export-columns";

/** 服务端直接生成 CSV 文件下载，避免把几万行 JSON 传给浏览器再由前端拼文件。 */
export async function GET(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);
  params.set("export", "1");
  try {
    const data = await listMonthlyBillingWriteOffs(params);
    return csvFileResponse(
      monthlyBillingWriteOffExportFilename,
      buildCsvContent(data.rows, monthlyBillingWriteOffDisplayColumns),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "月账单明细导出失败" },
      { status: 500 },
    );
  }
}
