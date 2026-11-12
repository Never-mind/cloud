import { NextRequest, NextResponse } from "next/server";
import { addProspectFollowup, convertProspect, prospectCustomerMatches, ProspectError } from "@/lib/prospect-service";
import { requireProspectAccess, prospectErrorResponse } from "@/lib/prospect-access";
type Context={params:Promise<{id:string;action:string}>};
export async function GET(request:NextRequest,{params}:Context){try{const {id,action}=await params;if(action!=="matches")throw new ProspectError("页面不存在",404);await requireProspectAccess(request,"view","view");return NextResponse.json(await prospectCustomerMatches(id,Object.fromEntries(request.nextUrl.searchParams)));}catch(e){return prospectErrorResponse(e);}}
export async function POST(request:NextRequest,{params}:Context){try{
  const {id,action}=await params;
  if(action==='followups'){const {actor}=await requireProspectAccess(request,"update");return NextResponse.json(await addProspectFollowup(id,await request.json(),actor),{status:201});}
  if(action==='convert'){const input=await request.json();const {actor}=await requireProspectAccess(request,"confirm",input.mode==='create'?'create':'view');return NextResponse.json(await convertProspect(id,input,actor));}
  throw new ProspectError("操作不存在",404);
}catch(e){return prospectErrorResponse(e);}}
