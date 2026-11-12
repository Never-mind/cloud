import {beforeEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({email:vi.fn(),permission:vi.fn(),actor:vi.fn(),execute:vi.fn(),batch:vi.fn(),sources:vi.fn()}));
vi.mock('@/lib/auth',()=>({getAuthenticatedUserEmail:m.email}));
vi.mock('@/lib/permission-service',()=>({getPermissionStateForEmail:vi.fn(async()=>({}))}));
vi.mock('@/lib/permission-definitions',()=>({hasPermission:m.permission}));
vi.mock('@/lib/operation-actor',()=>({getOperationActor:m.actor}));
vi.mock('@/lib/operation-log',()=>({recordOperationLog:vi.fn(async()=>{})}));
vi.mock('@/lib/invoice-batch-import-service',()=>({executeImportRow:m.execute,getImportBatch:m.batch,findImportSources:m.sources,createImportBatch:vi.fn(),listImportBatches:vi.fn(),updateImportRow:vi.fn()}));
vi.mock('@/lib/invoice-service',()=>({readInvoiceFile:vi.fn()}));
import {GET,POST} from './route';
import {readInvoiceFile} from '@/lib/invoice-service';
import {unzipSync,strFromU8} from 'fflate';
const post=()=>new NextRequest('http://localhost/api/invoices/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'execute',batchId:'batch',rowId:'row',version:1})});
beforeEach(()=>{vi.resetAllMocks();m.email.mockReturnValue('owner@example.test');m.permission.mockReturnValue(true);m.actor.mockResolvedValue({userId:'actor',displayName:'Test'});m.execute.mockResolvedValue({status:'issued',invoiceId:'invoice'});});
describe('batch invoice API access',()=>{
 it('packages converted PDFs once per invoice and uses the returned PDF filenames',async()=>{
  m.batch.mockResolvedValue({rows:[{invoiceId:'invoice1'},{invoiceId:'invoice1'},{invoiceId:'invoice2'}]});
  vi.mocked(readInvoiceFile).mockImplementation(async(id)=>({bytes:Buffer.from(`%PDF-1.7\n${id}`),contentType:'application/pdf',fileName:`${id}.pdf`}));
  const response=await GET(new NextRequest('http://localhost/api/invoices/import?action=download&id=batch'));
  expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('application/zip');
  const files=unzipSync(new Uint8Array(await response.arrayBuffer()));
  expect(Object.keys(files)).toEqual(['invoice1-invoice1.pdf','invoice2-invoice2.pdf']);
  expect(Object.values(files).every(bytes=>strFromU8(bytes).startsWith('%PDF-'))).toBe(true);
  expect(readInvoiceFile).toHaveBeenCalledTimes(2);
 });
 it('returns a conversion error instead of a partial ZIP containing HTML',async()=>{
  m.batch.mockResolvedValue({rows:[{invoiceId:'invoice1'}]});
  vi.mocked(readInvoiceFile).mockRejectedValue(Object.assign(new Error('PDF 转换失败'),{status:503}));
  const response=await GET(new NextRequest('http://localhost/api/invoices/import?action=download&id=batch'));
  expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'PDF 转换失败'});
 });
 it('does not execute without login',async()=>{m.email.mockReturnValue(null);expect((await POST(post())).status).toBe(401);expect(m.execute).not.toHaveBeenCalled();});
 it('requires invoice create and view rights',async()=>{m.permission.mockImplementation((_state,_module,action)=>action!=='create');expect((await POST(post())).status).toBe(403);expect(m.execute).not.toHaveBeenCalled();});
 it('does not expose source records without source update rights',async()=>{m.permission.mockImplementation((_state,module,action)=>module==='invoices'||action!=='update');expect((await GET(new NextRequest('http://localhost/api/invoices/import?action=sources&module=cloud_row'))).status).toBe(403);expect(m.sources).not.toHaveBeenCalled();});
 it('passes the authenticated owner and source policy, never a posted actor',async()=>{expect((await POST(post())).status).toBe(200);expect(m.execute).toHaveBeenCalledWith('batch','row',1,expect.objectContaining({email:'owner@example.test',canUse:expect.any(Function)}),{userId:'actor',name:'Test'});});
 it('rejects unsupported actions without financial mutations',async()=>{const response=await POST(new NextRequest('http://localhost/api/invoices/import',{method:'POST',body:JSON.stringify({action:'delete-all'})}));expect(response.status).toBe(400);expect(m.execute).not.toHaveBeenCalled();});
});
