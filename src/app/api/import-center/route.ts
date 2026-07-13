import { NextResponse } from "next/server";
import { listImportTargets } from "@/lib/import-center";
import { listImportJobs } from "@/lib/import-center-service";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const [targets, jobResult] = await Promise.all([Promise.resolve(listImportTargets()), listImportJobs(searchParams)]);
  return NextResponse.json({
    targets,
    jobs: jobResult.jobs,
    pagination: {
      total: jobResult.total,
      page: jobResult.page,
      pageSize: jobResult.pageSize,
    },
  });
}
