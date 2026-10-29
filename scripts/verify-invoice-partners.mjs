import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

// Every API call is intercepted; no application server or database is used.
const root = process.cwd(), require = createRequire(import.meta.url);
const runtime = process.env.CODEX_NODE_MODULES || 'C:/Users/wgx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [root, runtime] }));
const harness = [
  "import React,{useState} from 'react';import{createRoot}from'react-dom/client';",
  "import{InvoiceDraftModal}from'./src/components/invoice-draft-modal';",
  "import{SupplierPaymentForm}from'./src/components/cloud-reconciliation-page';",
  "import{ServiceFeeStatementsPage}from'./src/components/service-fee-statements-page';",
  "import{InvoiceFormFields}from'./src/components/settlement-project-detail-workspace';",
  "function App(){const p=new URLSearchParams(location.search),mode=p.get('mode');const[value,setValue]=useState({id:'payment',supplierId:'s1',supplierName:'业务供应商',invoiceCurrency:'CNY',type:'cost',invoiceEntityId:'s1',invoiceEntity:'业务供应商',companyEntityId:'u1',companyEntity:'默认单位'});",
  "const masters={suppliers:[{id:'s1',name:'业务供应商'},{id:'s2',name:'实际开票供应商',taxNumber:'S-TAX-2'}],undertakingUnits:[],customers:[]};",
  "if(mode==='supplier')return <SupplierPaymentForm value={value} masters={masters} onChange={setValue} onCancel={()=>{}} onSave={async()=>{window.saved=value}}/>;",
  "if(mode==='service')return <ServiceFeeStatementsPage/>;",
  "if(mode==='settlement')return <><InvoiceFormFields draft={value} partners={{suppliers:[{supplierId:'s2',nameCn:'实际开票供应商',taxNumber:'S-TAX-2'}],customers:[{customerId:'c2',name:'实际客户',taxNumber:'C-TAX-2'}],undertakingUnits:[{undertakingUnitId:'u2',entityName:'实际单位'}]}} onChange={(key,val)=>setValue(current=>({...current,[key]:val}))}/><button onClick={()=>{window.saved=value}}>测试保存</button></>;",
  "return <InvoiceDraftModal open mode='generated' sourceType={p.get('source')||'cloud_row'} sourceId='source' onClose={()=>{}} onSaved={value=>{window.saved=value}}/>;}",
  "createRoot(document.getElementById('root')).render(<App/>);",
].join('\n');
const bundle = await build({stdin:{contents:harness,loader:'tsx',resolveDir:root},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',alias:{'@':resolve(root,'src')},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'isolated-forms',setup(plugin){
  plugin.onLoad({filter:/cloud-reconciliation-page\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8'))+'\nexport { SupplierPaymentForm };',loader:'tsx',resolveDir:resolve(root,'src/components')}));
  plugin.onLoad({filter:/settlement-project-detail-workspace\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8'))+'\nexport { InvoiceFormFields };',loader:'tsx',resolveDir:resolve(root,'src/components')}));
  plugin.onLoad({filter:/app-dialog\.tsx$/},()=>({contents:'export const notify=(...args)=>{window.notices??=[];window.notices.push(args)};export const confirmDialog=async()=>true;',loader:'js'}));
  plugin.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:'next-test'}));
  plugin.onLoad({filter:/.*/,namespace:'next-test'},args=>({contents:args.path.endsWith('link')?'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>;}':'export const useRouter=()=>({push(){},refresh(){},replace(){}});export const useSearchParams=()=>new URLSearchParams();export const usePathname=()=>"/";export const useParams=()=>({});',loader:'tsx',resolveDir:root}));
}}]});
const css=(await postcss([tailwind()]).process(await readFile('src/app/globals.css','utf8'),{from:resolve(root,'src/app/globals.css')})).css;
const server=createServer((req,res)=>{
  if(req.url.startsWith('/bundle.js')){res.setHeader('Content-Type','application/javascript');res.end(bundle.outputFiles[0].text);}
  else if(req.url.startsWith('/style.css')){res.setHeader('Content-Type','text/css');res.end(css);}
  else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true});
const output=resolve(root,'docs/invoice-partners/verification');await mkdir(output,{recursive:true});
const base={sourceId:'source',sourceNo:'测试账单',period:'202610',customerId:'c1',undertakingUnitId:'u1',invoiceDate:'2026-10-28',dueDate:'2026-11-27',paymentTermDays:30,currency:'CNY',suggestedInvoiceNo:'TEST',amountExcludingTax:'100',taxRate:'6',taxAmount:'6',amountIncludingTax:'106',customerName:'原客户全称',sellerName:'原单位',customerAddress:'旧地址',bankName:'旧银行',bankAccount:'OLD',lines:[{date:'2026-10',desc:'Service',cost:'106'}]};
const customers=[{customerId:'c1',name:'原客户'},{customerId:'c2',shortName:'新客户',name:'新客户全称',taxNumber:'C-TAX-2'}];
const units=[{undertakingUnitId:'u1',name:'原单位'},{undertakingUnitId:'u2',entityName:'新承接单位',taxNumber:'U-TAX-2'}];
const results=[];
async function choose(page,placeholder,term,label){const input=page.getByPlaceholder(placeholder,{exact:true}).filter({visible:true});await input.fill(term);await page.locator('[data-search-select-panel]:visible').getByRole('button',{name:label,exact:false}).click();}
try {
for(const width of [1440,390]) for(const mode of ['local','cloud','vat','supplier','settlement','service']) {
  const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(10000);const errors=[],writes=[];let failPartnerSelection=false;
  page.on('pageerror',error=>{ errors.push(error.message); console.error(mode+' '+width+': '+error.stack); });
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin){await route.abort();throw new Error('Unexpected external request '+url.origin);}
    if(!url.pathname.startsWith('/api/'))return route.continue();
    let data={};
    if(req.method()!=='GET'){writes.push({path:url.pathname,body:req.postDataJSON()});data={ok:true,invoice:{id:'saved'},instanceCode:'mock-only'};}
    else if(url.pathname.startsWith('/api/entities/'))data={rows:url.pathname.includes('customers')?customers:url.pathname.includes('undertaking')?units:[],total:2};
    else if(url.pathname==='/api/invoices/partners')data={internationalName:'新客户全称',name:'新客户全称',taxNumber:'C-TAX-2',address:'新地址',phone:'123',email:'new@example.test',paymentTermDays:45,bankName:'新银行',bankAccount:'NEW',country:'CN',...(url.searchParams.get('kind')==='undertakingUnits'?{internationalName:'新承接单位'}:{})};
    else if(url.pathname==='/api/invoices/prefill')data=base;
    else if(url.pathname==='/api/invoices/approval/returns')data={approvals:[]};
    else if(url.pathname==='/api/invoices/approval/prefill'){
      const cid=url.searchParams.get('customerId')||'c1',uid=url.searchParams.get('undertakingUnitId')||'u1';
      if(failPartnerSelection && cid==='c2'){
        failPartnerSelection=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'测试资料读取失败'})});return;
      }
      const selected=cid==='c2',unitChanged=uid==='u2';
      const fields={customerName:selected?'新客户全称':'原客户全称',taxId:selected?'C-TAX-2':'OLD-TAX',address:selected?'新地址':'旧地址',phone:selected?'222':'111',bankName:selected?'新银行':'旧银行',bankAccount:selected?'NEW':'OLD'};
      const attachmentOptions=[{source:'customer',attachmentId:cid+'-file',fileName:cid+'-CSF.pdf',sourceLabel:'客户档案',fileSize:3}];
      data=url.searchParams.get('flow')==='vat'?{sourceNo:'测试账单',period:'202610',sourceCurrency:'CNY',sourceAmountIncludingTax:'106',currency:'CNY',draft:{...fields,customerId:cid,undertakingUnitId:uid,companyKey:uid,invoiceType:'special',paymentTermDays:unitChanged?'45':'30',months:['oct'],payments:['post'],amountExcludingTax:'100',taxRate:'6',taxAmount:'6',amountIncludingTax:'106',attachmentIds:[]},options:{companies:[{value:'u1',label:'原单位'},{value:'u2',label:'新承接单位'}],months:[{value:'oct',label:'10月'}],payments:[{value:'post',label:'后付'}]},attachmentOptions,blockers:[],existingApproval:null}:{...base,undertakingUnitId:uid,branch:'mx',companyText:unitChanged?'新承接单位':'原单位',customer:{customerId:cid,name:fields.customerName,taxId:fields.taxId,address:fields.address,postCode:'100000',taxRegime:'Regime'},customerAttachments:[],attachmentOptions,attachmentField:{id:'csf',name:'CSF'},amountCurrencyOptions:['CNY'],suggestedPurpose:'Purpose',suggestedInvoiceContent:'Services',paymentReceivedTime:unitChanged?'2026-12-12':'2026-11-27',paymentTermDays:unitChanged?45:30,options:{paymentMethods:[],cfdiCodes:[],chileInvoiceTypes:[],chileNote2:[]},warnings:[],blockers:[],existingApproval:null};
    }else if(url.pathname==='/api/cloud/master-data')data={suppliers:[{id:'s1',name:'业务供应商'},{id:'s2',name:'实际开票供应商',taxNumber:'S-TAX-2'}],undertakingUnits:[],customers:[]};
    else if(url.pathname.startsWith('/api/cloud/attachments/'))data=[];
    else if(url.pathname==='/api/service-fees/snapshots')data={rows:[{snapshotNo:'source',countryCode:'CN',writeOffMonth:'202610',status:'已确认',invoiceStatus:'未开票',repaymentStatus:'未回款',defaultReceivingUnitId:'u1',defaultPayerCustomerId:'c1'}],total:1,page:1,pageSize:20};
    else if(url.pathname.startsWith('/api/service-fees/snapshots/'))data={rows:[]};
    else throw new Error('Unhandled mocked API '+url.pathname);
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(origin+'/?mode='+mode+'&source='+(width===390?'service_fee':'cloud_row'));
  console.log('Checking '+mode+' '+width);
  if(mode==='local'){
    await choose(page,'按名称 / 编码 / 税号搜索客户','C-TAX-2','新客户');
    await page.getByText('开票资料（自动带入，可展开修改）',{exact:true}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('input')].some(input=>input.value==='C-TAX-2'));
    assert.equal(await page.getByLabel('客户税号',{exact:true}).inputValue(),'C-TAX-2');
    assert.equal(await page.getByLabel('客户开票地址',{exact:true}).inputValue(),'新地址');
    await choose(page,'按名称 / 编码 / 税号搜索承接单位','U-TAX-2','新承接单位');
    await page.waitForFunction(()=>[...document.querySelectorAll('input')].some(input=>input.value==='NEW'));
    assert.equal(await page.getByLabel('开户银行',{exact:true}).inputValue(),'新银行');
    await page.getByLabel('客户开票地址',{exact:true}).fill('本次指定地址');
    await page.screenshot({path:resolve(output,'local-'+width+'.png'),fullPage:true});
    await page.getByRole('button',{name:'生成并标记已开票',exact:true}).click();
    await page.waitForFunction(()=>window.saved);
    assert.equal(writes.at(-1).body.customerId,'c2');assert.equal(writes.at(-1).body.undertakingUnitId,'u2');assert.equal(writes.at(-1).body.customerAddress,'本次指定地址');assert.equal(writes.at(-1).body.paymentTermDays,'45');
  }else if(mode==='cloud'||mode==='vat'){
    await page.getByRole('button',{name:'飞书审批开票',exact:true}).click();
    if(mode==='vat')await page.getByRole('tab',{name:'增值税开票申请',exact:true}).click();
    {
      failPartnerSelection=true;
      await choose(page,'搜索客户名称、编码或税号','C-TAX-2','新客户');
      await page.getByRole('alert').filter({hasText:'测试资料读取失败'}).waitFor();
      assert.equal(await page.getByRole('button',{name:'提交飞书审批',exact:true}).isDisabled(),true);
      assert.equal(await page.getByPlaceholder('搜索客户名称、编码或税号',{exact:true}).filter({visible:true}).inputValue(),'原客户');
      if(mode==='vat')await page.getByRole('button',{name:'刷新选项',exact:false}).click();
      else await choose(page,'搜索承接单位名称、编码或税号','U-TAX-2','新承接单位');
      await page.waitForFunction(()=>!document.querySelector('[role="alert"]') && [...document.querySelectorAll('input')].some(input=>input.value==='OLD-TAX'));
      assert.equal(await page.getByLabel(mode==='vat'?'客户公司名称':'Customer Name',{exact:true}).inputValue(),'原客户全称');
    }
    await choose(page,'搜索客户名称、编码或税号','C-TAX-2','新客户');
    const tax=mode==='vat'?page.getByLabel('纳税人识别号',{exact:true}):page.getByLabel('TAX ID',{exact:false});
    await page.waitForFunction(()=>[...document.querySelectorAll('input')].some(input=>input.value==='C-TAX-2'));
    assert.equal(await tax.inputValue(),'C-TAX-2');
    await choose(page,'搜索承接单位名称、编码或税号','U-TAX-2','新承接单位');
    await page.waitForFunction(()=>[...document.querySelectorAll('input')].some(input=>input.value==='45'));
    const name=mode==='vat'?page.getByLabel('客户公司名称',{exact:true}):page.getByLabel('Customer Name',{exact:true});
    await name.fill('本次确认名称');
    await page.screenshot({path:resolve(output,mode+'-'+width+'.png'),fullPage:true});
    await page.getByRole('button',{name:'提交飞书审批',exact:true}).click();
    await page.waitForFunction(()=>window.notices?.some(item=>String(item[0]).includes('已提交')||String(item[0]).includes('已发起')));
    const body=writes.at(-1).body,draft=mode==='vat'?body.draft:body;
    assert.equal(draft.customerId,'c2');assert.equal(draft.undertakingUnitId,'u2');assert.equal(mode==='vat'?draft.customerName:body.customerOverride.name,'本次确认名称');
  }else if(mode==='supplier'){
    await page.getByLabel('实际开票供应商',{exact:true}).fill('S-TAX-2');
    await page.locator('[data-search-select-panel]').getByRole('button',{name:'实际开票供应商',exact:false}).click();
    await page.getByRole('button',{name:'确认保存',exact:true}).click();
    const saved=await page.evaluate(()=>window.saved);assert.equal(saved.supplierId,'s1');assert.equal(saved.invoiceSupplierId,'s2');
    await page.screenshot({path:resolve(output,mode+'-'+width+'.png'),fullPage:true});
  }else if(mode==='settlement'){
    const kind=page.locator('select').first();await kind.selectOption('income');
    const field=page.getByPlaceholder('搜索供应商、承接单位或客户',{exact:true}).nth(1);await field.fill('C-TAX-2');
    await page.locator('[data-search-select-panel]').getByRole('button',{name:'实际客户',exact:false}).click();
    await page.getByRole('button',{name:'测试保存',exact:true}).click();assert.equal((await page.evaluate(()=>window.saved)).invoiceEntityType,'customer');
    await kind.selectOption('cost');await field.fill('C-TAX-2');assert.equal(await page.locator('[data-search-select-panel]').getByRole('button').count(),0);
    await field.fill('S-TAX-2');await page.locator('[data-search-select-panel]').getByRole('button',{name:'实际开票供应商',exact:false}).click();
    await page.getByRole('button',{name:'测试保存',exact:true}).click();assert.equal((await page.evaluate(()=>window.saved)).invoiceEntityType,'supplier');
    await page.screenshot({path:resolve(output,mode+'-'+width+'.png'),fullPage:true});
  }else{
    await page.getByRole('button',{name:'展开全部',exact:true}).click();
    await page.getByRole('button',{name:'编辑开票',exact:true}).filter({visible:true}).click();
    await choose(page,'搜索客户名称、编码或税号','C-TAX-2','新客户');await choose(page,'搜索承接单位名称、编码或税号','U-TAX-2','新承接单位');
    await page.screenshot({path:resolve(output,mode+'-'+width+'.png'),fullPage:true});
    await page.getByRole('button',{name:'保存发票信息',exact:true}).click();
    await page.waitForTimeout(150);assert.equal(writes.at(-1).body.invoicePayerCustomerId,'c2');assert.equal(writes.at(-1).body.invoiceReceivingUnitId,'u2');
  }
  assert.deepEqual(errors,[]);results.push({mode,width,passed:true,writes:writes.length});await page.close();
}
await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
