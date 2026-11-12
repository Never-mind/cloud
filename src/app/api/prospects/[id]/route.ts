import { NextRequest, NextResponse } from "next/server";
import { getProspect, saveProspect, deleteProspect } from "@/lib/prospect-service";
import { requireProspectAccess, prospectErrorResponse } from "@/lib/prospect-access";
type Context={params:Promise<{id:string}>};
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const { actor, capabilities } = await requireProspectAccess(request, id === "new" ? "create" : "view");
    if (id === "new") {
      return NextResponse.json({ prospect: { status: "new", ownerName: actor.displayName }, followups: [], capabilities });
    }
    return NextResponse.json({ ...await getProspect(id), capabilities });
  } catch (error) { return prospectErrorResponse(error); }
}
export async function PUT(request:NextRequest,{params}:Context){try{const {actor}=await requireProspectAccess(request,"update");return NextResponse.json(await saveProspect((await params).id,await request.json(),actor));}catch(e){return prospectErrorResponse(e);}}
export async function DELETE(request:NextRequest,{params}:Context){try{const {actor}=await requireProspectAccess(request,"delete");await deleteProspect((await params).id,actor);return NextResponse.json({ok:true});}catch(e){return prospectErrorResponse(e);}}
