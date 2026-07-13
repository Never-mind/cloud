import { NextRequest, NextResponse } from "next/server";
import { confirmImportJob } from "@/lib/import-center-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const jobId = String(body.jobId ?? "");
    if (!jobId) return NextResponse.json({ error: "导入任务ID不能为空" }, { status: 400 });

    const job = await confirmImportJob(jobId);
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
