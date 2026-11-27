import { NextRequest, NextResponse } from 'next/server';
import { getJcDetail, listJcComponents } from '@/lib/internal-service-fee-jc-service';

export async function GET(request:NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    return NextResponse.json(id ? await getJcDetail(id) : await listJcComponents(request.nextUrl.searchParams));
  } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : 'JC数据加载失败'}, {status:400}); }
}
