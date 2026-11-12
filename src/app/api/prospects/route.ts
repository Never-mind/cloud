import { NextRequest, NextResponse } from "next/server";
import { listProspects, saveProspect } from "@/lib/prospect-service";
import { requireProspectAccess, prospectErrorResponse } from "@/lib/prospect-access";
export async function GET(request: NextRequest) {
  try { const {capabilities}=await requireProspectAccess(request,"view");return NextResponse.json({...await listProspects(request.nextUrl.searchParams),capabilities}); }catch(e){return prospectErrorResponse(e);}
}
export async function POST(request: NextRequest) {
  try {const {actor}=await requireProspectAccess(request,"create");return NextResponse.json(await saveProspect(null,await request.json(),actor),{status:201});}catch(e){return prospectErrorResponse(e);}
}
