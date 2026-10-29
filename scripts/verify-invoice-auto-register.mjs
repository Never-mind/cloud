import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const root=process.cwd(),require=createRequire(import.meta.url);
const runtime=process.env.CODEX_NODE_MODULES||'C:/Users/wgx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=require(require.resolve('playwright',{paths:[root,runtime]}));
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{InvoicesPage}from'./src/components/invoices-page';createRoot(document.getElementById('root')).render(<InvoicesPage/>);",loader:'tsx',resolveDir:root},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',alias:{'@':resolve(root,'src')},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'notices',setup(plugin){plugin.onLoad({filter:/app-dialog\.tsx$/},()=>({contents:'export const notify=(...args)=>{window.notices??=[];window.notices.push(args)};export const confirmDialog=async()=>true;',loader:'js'}));}}]});
const css=(await postcss([tailwind()]).process(await readFile('src/app/globals.css','utf8'),{from:resolve(root,'src/app/globals.css')})).css;
const server=createServer((req,res)=>{if(req.url.startsWith('/bundle.js')){res.setHeader('Content-Type','application/javascript');res.end(bundle.outputFiles[0].text);}else if(req.url.startsWith('/style.css')){res.setHeader('Content-Type','text/css');res.end(css);}else{res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:'msedge'});
const output=resolve(root,'docs/invoice-approval/verification');await mkdir(output,{recursive:true});
const invoice={id:'registered',invoiceNo:'26952000004580231776',approvalSerialNumber:'202610280008',approvalInstanceCode:'instance',source:'external',sourceNo:'202607 · TEST',status:'issued',currency:'CNY',amountExcludingTax:'852929.65',taxAmount:'51175.78',amountIncludingTax:'904105.43',invoiceDate:'2026-10-28',dueDate:'2026-11-27',fileName:'invoice.pdf'};
const primary={id:'file',fileName:'invoice.pdf',invoiceNo:invoice.invoiceNo,invoiceId:invoice.id,recognition:null};
const group={key:'invoice',primary,files:[primary],registered:true,conflicting:false};
try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const page=await browser.newPage({viewport}),errors=[],writes=[];let listRequests=0;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());if(request.method()!=='GET')writes.push(url.pathname);
  let data={};
  if(url.pathname==='/api/invoices'){listRequests++;const keyword=url.searchParams.get('keyword')||'';const matched=!keyword||[invoice.invoiceNo,invoice.approvalSerialNumber].some(value=>value.includes(keyword));data={rows:matched?[invoice]:[],total:matched?1:0};}
  else if(url.pathname==='/api/invoices/approval/returns')data={approvals:['vat','cloud'].map(flow=>({flow,instanceCode:flow,serialNumber:invoice.approvalSerialNumber,ownerNo:invoice.sourceNo,status:'approved',invoiceId:invoice.id,groups:[group]}))};
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('http://127.0.0.1:'+server.address().port);
 const search=page.getByPlaceholder('发票号 / 审批编号 / 客户 / 来源单据');
 await search.fill('202610280008');await page.getByText('审批编号：202610280008',{exact:true}).waitFor();
 assert.equal(await page.getByText('飞书回票',{exact:true}).count(),1);
 await page.getByText('904,105.43',{exact:true}).waitFor();
 await search.fill(invoice.invoiceNo);await page.locator('tbody tr').filter({hasText:invoice.invoiceNo}).waitFor();
 await page.screenshot({path:resolve(output,'auto-register-list-'+viewport.width+'.png'),fullPage:true});
 await page.getByRole('button',{name:'审批与回票',exact:true}).click();
 await page.getByText('已登记并回填账期',{exact:true}).first().waitFor();
 assert.equal(await page.getByText('已登记并回填账期',{exact:true}).count(),2);
 assert.equal(await page.getByRole('button',{name:'查看发票',exact:true}).count(),2);
 assert.equal(await page.getByRole('button',{name:/确认登记|核对发票|查看／处理回票/}).count(),0);
 const beforeClose=listRequests;
 await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==='/api/invoices'),page.getByRole('button',{name:'关闭',exact:true}).first().click()]);
 await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
 assert.ok(listRequests>beforeClose,'Closing approval progress refreshes invoices');
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 await page.close();console.log('Invoice list and automatic VAT/Cloud registration display passed: '+viewport.width);
}}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
