import {NextRequest,NextResponse} from 'next/server';
import {getAuthenticatedUserEmail} from '@/lib/auth';
import {changeInternalServiceAdjustmentStatus} from '@/lib/internal-service-fee-service';
export async function POST(request:NextRequest,context:{params:Promise<{adjustmentNo:string;action:string}>}) {
  try {
    const actor=getAuthenticatedUserEmail(request);
    if(!actor)return NextResponse.json({error:'请先登录'},{status:401});
    const {adjustmentNo,action}=await context.params;
    const body=await request.json();
    return NextResponse.json(await changeInternalServiceAdjustmentStatus(adjustmentNo,{...body,action},actor));
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'区间调整操作失败'},{status:400});}
}
