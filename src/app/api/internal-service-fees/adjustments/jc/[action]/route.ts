import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/auth';
import { previewJcAdjustment, confirmJcAdjustment, registerJcHistory, rollbackJcAdjustment } from '@/lib/internal-service-fee-jc-service';

export async function POST(request:NextRequest, context:{params:Promise<{action:string}>}) {
  try {
    const actor = getAuthenticatedUserEmail(request);
    if (!actor) return NextResponse.json({error:'请先登录'}, {status:401});
    const {action} = await context.params;
    const body = await request.json();
    const common = {id:String(body.id ?? ''),revision:String(body.revision ?? ''),reason:String(body.reason ?? '')};
    if (action === 'rollback') return NextResponse.json(await rollbackJcAdjustment(common,actor));
    if (action === 'history') return NextResponse.json(await registerJcHistory({...common,month:String(body.month ?? ''),amount:body.amount},actor));
    const input = {...common,approvedTotal:body.approvedTotal,approvedTotalReporting:body.approvedTotalReporting,resumeMonth:String(body.resumeMonth ?? ''),postingMonth:body.postingMonth ? String(body.postingMonth) : undefined};
    if (action === 'preview') return NextResponse.json(await previewJcAdjustment(input));
    if (action === 'confirm') return NextResponse.json(await confirmJcAdjustment(input,actor));
    return NextResponse.json({error:'不支持的操作'}, {status:404});
  } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : 'JC操作失败'}, {status:400}); }
}
