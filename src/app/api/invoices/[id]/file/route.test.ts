import {beforeEach, describe, expect, it, vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({email:vi.fn(),permission:vi.fn(),file:vi.fn(),html:vi.fn()}));
vi.mock('@/lib/auth',()=>({getAuthenticatedUserEmail:mocks.email}));
vi.mock('@/lib/permission-service',()=>({getPermissionStateForEmail:vi.fn(async()=>({}))}));
vi.mock('@/lib/permission-definitions',()=>({hasPermission:mocks.permission}));
vi.mock('@/lib/invoice-service',()=>({readInvoiceFile:mocks.file,renderInvoiceHtmlById:mocks.html}));
import {GET} from './route';
const download=(query='')=>GET(new NextRequest(`http://localhost/api/invoices/invoice/file${query}`),{params:Promise.resolve({id:'invoice'})});
beforeEach(()=>{vi.resetAllMocks();mocks.email.mockReturnValue('user@example.test');mocks.permission.mockReturnValue(true);});
describe('invoice download API',()=>{
 it('serves converted archived PDFs with a PDF filename and disables stale HTML caching',async()=>{
  mocks.file.mockResolvedValue({bytes:Buffer.from('%PDF-1.7\nfixture'),contentType:'application/pdf',fileName:'历史票面.pdf'});
  const response=await download();
  expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('application/pdf');
  expect(response.headers.get('content-disposition')).toContain(`filename*=UTF-8''${encodeURIComponent('历史票面.pdf')}`);
  expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.text()).toMatch(/^%PDF-/);
  expect(mocks.html).not.toHaveBeenCalled();
 });
 it('returns a readable conversion error instead of downloading HTML',async()=>{
  mocks.file.mockRejectedValue(Object.assign(new Error('PDF 转换失败'),{status:503}));
  const response=await download();expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'PDF 转换失败'});
 });
 it('provides HTML only through its explicit format option',async()=>{
  mocks.html.mockResolvedValue('<html>print view</html>');
  const response=await download('?format=html');expect(response.headers.get('content-type')).toContain('text/html');expect(mocks.file).not.toHaveBeenCalled();
 });
 it('keeps external XML in its original format',async()=>{
  mocks.file.mockResolvedValue({bytes:Buffer.from('<invoice/>'),contentType:'application/xml',fileName:'original.xml'});
  const response=await download();expect(response.headers.get('content-type')).toBe('application/xml');expect(await response.text()).toBe('<invoice/>');
 });
 it.each([401,403])('does not read the file when access returns %s',async(status)=>{
  if(status===401)mocks.email.mockReturnValue(null);else mocks.permission.mockReturnValue(false);
  expect((await download()).status).toBe(status);expect(mocks.file).not.toHaveBeenCalled();
 });
});
