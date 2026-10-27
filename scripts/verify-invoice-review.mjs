import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const root = process.cwd();
const require = createRequire(import.meta.url);
const runtime = process.env.CODEX_NODE_MODULES || 'C:/Users/wgx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const matchedParty = (id, name) => ({status:'matched', via:'税号', id, name, candidates:[{id,name}],...(id.startsWith('unit-')?{paymentTermDays:'30'}:{})});
const fixture = { source: 'Test XML', kind: 'VAT', exact: true, fields: [], warnings: [],
  facts: { issuerName: 'Unit', issuerTaxNumber: 'TAX-U', receiverName: 'Customer', receiverTaxNumber: 'TAX-C', invoiceNo: 'TEST-REVIEW', invoiceDate: '2026-10-23', currency: 'USD', exchangeRate: '1', amountExcludingTax: '100', taxRate: '13', taxAmount: '12.99', amountIncludingTax: '112.99', taxUuid: 'TEST-UUID' },
  matches: { issuerUnitId: 'unit-1', receiverUnitId: 'unit-1', issuerSupplierId: 'supplier-1', receiverCustomerId: 'customer-1' },
  partyMatches: {issuerUnit:matchedParty('unit-1','Unit'),receiverUnit:matchedParty('unit-1','Unit'),issuerSupplier:matchedParty('supplier-1','Supplier'),receiverCustomer:matchedParty('customer-1','Customer')},
  form: { type: 'cost', accountPeriod: '2026-10-23', accountingDate: '', invoiceNo: 'TEST-REVIEW', invoiceDate: '2026-10-23', receivableDate: '2026-11-22', currency: 'USD', exchangeRate: '1', amountExcludingTax: '100', taxRate: '13', taxAmount: '12.99', invoiceTotal: '112.99', taxUuid: 'TEST-UUID', companyEntityId: 'unit-1', companyEntity: 'Unit', invoiceEntityId: 'supplier-1', invoiceEntity: 'Supplier', invoiceEntityType: 'supplier' },
};
const harness = [
  "import React, {useState} from 'react';",
  "import {createRoot} from 'react-dom/client';",
  "import {InvoiceDraftModal} from './src/components/invoice-draft-modal';",
  "import {InvoiceRecognizeModal} from './src/components/invoice-recognize-modal';",
  "import {PurchaseOrderInvoicePanel} from './src/components/purchase-order-invoice-panel';",
  "import {SupplierPaymentForm} from './src/components/cloud-reconciliation-page';",
  "function App(){const mode=new URLSearchParams(location.search).get('mode')||'cloud_row';const [open,setOpen]=useState(true);const [value,setValue]=useState({id:'payment-1',supplierId:'supplier-1',invoiceNo:'OLD-INVOICE',invoiceNetAmount:'999',invoiceTaxAmount:'99',invoiceTotalAmount:'1098',invoiceCurrency:'USD',invoiceExchangeRate:'1',receivableDate:'2026-12-10',paid:0});const save=(form,file)=>{window.saved={form,file:file?.name};setOpen(false);return Promise.resolve();};",
  "if(mode==='purchase')return <PurchaseOrderInvoicePanel purchaseOrderId='po-1'/>;if(!open)return <div>Closed</div>;",
  "if(mode==='settlement')return <InvoiceRecognizeModal open projectId='project-1' onClose={()=>setOpen(false)} onSaved={save}/>;",
  "if(mode==='supplier')return <SupplierPaymentForm value={value} masters={{suppliers:[{id:'supplier-1',name:'Supplier'}],undertakingUnits:[{id:'unit-1',name:'Unit'}],customers:[]}} onChange={setValue} onCancel={()=>setOpen(false)} onSave={file=>save(value,file)}/>;",
  "return <InvoiceDraftModal open mode='external' sourceType={mode} sourceId='source-1' onClose={()=>setOpen(false)} onSaved={invoice=>{window.saved=invoice;}}/>;}createRoot(document.getElementById('root')).render(<App/>);",
].join('\n');
const bundle = await build({ stdin: { contents: harness, loader: 'tsx', resolveDir: root }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, alias: { '@': resolve(root, 'src') }, plugins: [{ name: 'invoice-review-harness', setup(plugin) {
  plugin.onLoad({ filter: /cloud-reconciliation-page\.tsx$/ }, async args => ({ contents: (await readFile(args.path, 'utf8')) + '\nexport { SupplierPaymentForm };', loader: 'tsx', resolveDir: resolve(root, 'src/components') }));
  plugin.onLoad({ filter: /app-dialog\.tsx$/ }, () => ({ contents: 'export const notify=(...args)=>{window.notices??=[];window.notices.push(args)};export const confirmDialog=async()=>true;', loader: 'js' }));
} }] });
const css = (await postcss([tailwind()]).process(await readFile('src/app/globals.css', 'utf8'), { from: resolve(root, 'src/app/globals.css') })).css;
const server = createServer((req, res) => {
  if(req.url.startsWith('/bundle.js')){res.setHeader('Content-Type','application/javascript');res.end(bundle.outputFiles[0].text);}
  else if(req.url.startsWith('/style.css')){res.setHeader('Content-Type','text/css');res.end(css);}
  else {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = resolve(root, 'docs/invoice-review/verification');
await mkdir(output, { recursive: true });
const results = [];
try {
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
 for(const mode of ['cloud_row','service_fee','settlement','supplier','purchase']) {
  for(const action of ['cancel','confirm','fallback',...(['cloud_row','service_fee','settlement'].includes(mode)?['manual_party','ambiguous']:[]),...(['cloud_row','service_fee'].includes(mode)?['replace_file','edit_days','edit_date','edit_due','refresh_terms','terms_failure']:[]),...(mode==='purchase'?['upload_retry']:[])]) {
   const page = await browser.newPage({ viewport });
   const errors = []; const writes = [];
   let attachmentAttempts=0; let recognitionAttempts=0;
   const termsRequests=[];
   let expectedTerm='30'; let expectedDue='2026-11-22'; let expectedInvoiceDate='2026-10-23';
   const entityPages = [];
   let purchaseInfo={supplierId:'supplier-1',orderCurrency:'USD',invoiceCurrency:'USD',paymentStatus:'已驳回',expectedPaymentDate:'2026-12-10',invoiceNo:'OLD-INVOICE',invoiceNetAmount:999,invoiceTaxAmount:99,invoiceAmount:1098};
   page.on('pageerror', error => errors.push(error.message));
   await page.route('**/api/**', async route => {
    const request = route.request(); const url = new URL(request.url()); let body = {};
    if(url.pathname.includes('/entities/undertaking-units/')) {
      const id=url.pathname.split('/').at(-1); termsRequests.push(id);
      if(action==='terms_failure'&&termsRequests.length===1){await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Temporary terms lookup failure'})});return;}
      body={undertakingUnitId:id,paymentTermDays:id==='unit-default'?7:30};
    } else if(url.pathname.includes('/entities/')) {
      const entity=url.pathname.split('/').at(-1); const pageNumber=Number(url.searchParams.get('page'));
      entityPages.push(entity+':'+pageNumber);
      const entries=entity==='customers'?[{customerId:'customer-default',name:'Default Customer'},{customerId:'customer-1',shortName:'',nameCn:'',name:'Customer'}]:entity==='undertaking-units'?[{undertakingUnitId:'unit-default',name:'Default Unit'},{undertakingUnitId:'unit-1',shortName:'',name:'',entityName:'Unit'}]:[{supplierId:'supplier-default',nameCn:'Default Supplier'},{supplierId:'supplier-1',shortName:'',nameCn:'Supplier'}];
      body={rows:entries.slice(pageNumber-1,pageNumber),total:2};
    } else if(url.pathname.endsWith('/prefill')) {
      body={sourceId:'source-1',period:'202609',customerId:'customer-default',undertakingUnitId:'unit-default',invoiceDate:'2026-09-30',paymentTermDays:1111,dueDate:'2026-11-01',currency:'USD',exchangeRate:'1',amountExcludingTax:'100',taxRate:'13',taxAmount:'13',amountIncludingTax:'113',suggestedInvoiceNo:'INTERNAL-NUMBER',lines:[]};
    } else if(url.pathname.endsWith('/recognize') || url.pathname.endsWith('/invoice-recognize')) {
      if(action==='fallback'){await route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:'No selectable text'})});return;}
      recognitionAttempts++;
      const recognition=structuredClone(fixture);
      if(action==='refresh_terms'&&recognitionAttempts===1)recognition.partyMatches.issuerUnit.paymentTermDays='1111';
      if(action==='ambiguous'||(action==='replace_file'&&recognitionAttempts>1)){
        for(const key of Object.keys(recognition.matches))recognition.matches[key]='';
        for(const [key,match] of Object.entries(recognition.partyMatches))recognition.partyMatches[key]={...match,id:'',name:'',status:'ambiguous',candidates:[...match.candidates,{id:match.id.replace('-1','-default'),name:'Default '+match.name}]};
        recognition.form.companyEntityId=''; recognition.form.invoiceEntityId='';
      }
      body={recognition};
    } else if(url.pathname.endsWith('/invoice-info')) {
      if(request.method()==='PATCH'){
        const patch=request.postDataJSON(); writes.push({url:url.pathname,body:patch}); purchaseInfo={...purchaseInfo,...patch};
      }
      body={invoiceInfo:purchaseInfo};
    } else if(request.method()==='POST'||request.method()==='PATCH'){
      writes.push({url:url.pathname,body:request.postData()});
      if(url.pathname.includes('/attachments/')&&action==='upload_retry'&&attachmentAttempts++===0){
        await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Upload interrupted'})});return;
      }
      body={invoice:{id:'invoice-1',invoiceNo:'TEST-REVIEW'}};
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   await page.goto(base+'/?mode='+mode);
   await page.locator('input[type=file]').first().setInputFiles({name:'review.xml',mimeType:'application/xml',buffer:Buffer.from('<test/>')});
   const field=label=>page.locator('label').filter({hasText:new RegExp('^\\s*'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).locator('input,select').first();
   const confirmName=mode==='settlement'?'确认并新增到明细':mode==='supplier'||mode==='purchase'?'确认保存':'确认并保存发票';
   if(action==='fallback'){
     await page.getByRole('button',{name:confirmName,exact:true}).waitFor({state:'visible'});
     await page.waitForFunction(()=>document.body.textContent.includes('手工')||window.notices?.some(item=>item[0].includes('手工')));
     assert.equal(await field('发票号').inputValue(),'');
     await field('发票号').fill('MANUAL-REVIEW');
     await field('开票日期').fill('2026-10-23');
     if(mode==='settlement'){
       await field('类型').selectOption('cost');
       for(const [label,name] of [['承接单位','Unit'],['供应商','Supplier']]){
         await field(label).fill(name); await page.locator('[data-search-select-panel] button').filter({hasText:new RegExp('^'+name+'(?:'+name+')?$')}).first().click();
       }
       await field('币种').selectOption('USD'); await field('汇率（1 USD 对应原币）').fill('1');
     }
     await field(mode==='supplier'?'发票未税金额':'未税金额').fill('100');
     await field(mode==='supplier'?'发票税率（%）':'税率（%）').fill('13');
   } else await page.getByText('票面与确认值',{exact:true}).waitFor();
   const external=mode==='cloud_row'||mode==='service_fee';
   if((external||mode==='settlement')&&action!=='fallback'){
     const companyLabel=external?'开票主体（承接单位）':'承接单位';
     const partnerLabel=external?'客户抬头':'供应商';
     const partnerName=external?'Customer':'Supplier';
     if(action!=='ambiguous'){
       assert.equal(await field(companyLabel).inputValue(),'Unit');
       assert.equal(await field(partnerLabel).inputValue(),partnerName);
       if(external)await page.getByText('票面双方与业务单据默认单位不同，已按票面匹配填写本张发票，请确认。',{exact:true}).waitFor();
     }
     if(action==='replace_file'){
       await page.locator('input[type=file]').first().setInputFiles({name:'replacement.xml',mimeType:'application/xml',buffer:Buffer.from('<test/>')});
       await page.getByText('销方档案：2 条候选档案，待手工选择',{exact:true}).waitFor();
     }
     if(action==='refresh_terms'){
       assert.equal(await field('账期天数 / 到期日').inputValue(),'1111');
       await page.locator('input[type=file]').first().setInputFiles({name:'review.xml',mimeType:'application/xml',buffer:Buffer.from('<test/>')});
       await page.waitForFunction(()=>document.querySelector('input[type=number][min="0"]').value==='30');
     }
     if(action==='ambiguous'||action==='replace_file'){
       assert.equal(await field(companyLabel).inputValue(),''); assert.equal(await field(partnerLabel).inputValue(),'');
       await page.getByRole('button',{name:confirmName,exact:true}).click();
       assert.equal(writes.length,0); assert.equal(await page.evaluate(()=>window.saved),undefined);
     }
     if(['ambiguous','manual_party','replace_file'].includes(action)){
       for(const [label,name] of [[companyLabel,'Unit'],[partnerLabel,partnerName]]){
         const selectedName=action==='manual_party'?'Default '+name:name;
         await field(label).fill(selectedName);
         await page.locator('[data-search-select-panel] button').filter({hasText:new RegExp('^'+selectedName+'(?:'+selectedName+')?$')}).first().click();
       }
       if(external){await page.getByRole('button',{name:confirmName,exact:true}).waitFor();await page.waitForFunction(()=>!document.body.textContent.includes('正在读取主体账期'));if(action==='manual_party'){expectedTerm='7';expectedDue='2026-10-30';}}
     }
     assert.ok(entityPages.includes('undertaking-units:2'));
     assert.ok(entityPages.includes((external?'customers':'suppliers')+':2'));
   }
   if(external){
     if(action==='terms_failure'){
       await field('开票主体（承接单位）').fill('Default Unit');
       await page.locator('[data-search-select-panel] button').filter({hasText:/^Default Unit(?:Default Unit)?$/}).click();
       await page.getByRole('alert').waitFor();
       assert.equal(await page.getByRole('button',{name:confirmName,exact:true}).isDisabled(),true);
       assert.equal(writes.length,0);
       await field('开票主体（承接单位）').fill('Unit');
       await page.locator('[data-search-select-panel] button').filter({hasText:/^Unit(?:Unit)?$/}).click();
       await page.waitForFunction(()=>!document.body.textContent.includes('正在读取主体账期'));
     }
     if(action==='edit_days'){await field('账期天数 / 到期日').fill('45');expectedTerm='45';expectedDue='2026-12-07';}
     if(action==='edit_date'){await field('开票日期').fill('2026-10-21');expectedInvoiceDate='2026-10-21';expectedDue='2026-11-20';}
     if(action==='edit_due'){
       await field('开票日期').fill('2026-10-21');
       await page.locator('input[type=date]').last().fill('2026-10-30');expectedInvoiceDate='2026-10-21';expectedTerm='9';expectedDue='2026-10-30';
     }
     assert.equal(await field('账期天数 / 到期日').inputValue(),expectedTerm);
     assert.equal(await page.locator('input[type=date]').last().inputValue(),expectedDue);
   }
   assert.equal(writes.length,0,mode+': wrote before confirmation');
   const label = mode==='supplier'?'发票税金':'税金';
   await page.locator('label').filter({has:page.getByText(label,{exact:true})}).locator('input').fill('12.98');
   const grossLabel=mode==='supplier'?'发票含税金额':'含税金额';
   assert.equal(await page.locator('label').filter({has:page.getByText(grossLabel,{exact:true})}).locator('input').inputValue(),'112.98');
   const device=viewport.width<600?'mobile':'desktop';
   const dialog=await page.getByRole('dialog').boundingBox();
   assert.ok(dialog&&dialog.x>=0&&dialog.width<=viewport.width,mode+': dialog outside viewport');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,mode+': page overflows');
   await page.screenshot({path:resolve(output,mode+'-'+action+'-'+device+'.png')});
   if(action==='cancel'){
     await page.getByRole('button',{name:'取消',exact:true}).click();
     assert.equal(writes.length,0); assert.equal(await page.evaluate(()=>window.saved),undefined);
   } else {
     await page.getByRole('button',{name:confirmName,exact:true}).click();
     if(action==='upload_retry'){
       await page.waitForFunction(()=>window.notices?.some(item=>item[0].includes('字段已保存')));
       assert.equal(await page.getByRole('dialog').count(),1);
       assert.equal(await field('税金').inputValue(),'12.98');
       assert.equal(writes.length,2);
       await page.getByRole('button',{name:confirmName,exact:true}).click();
     }
     await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));
     if(mode==='purchase'){
       assert.equal(writes.length,action==='upload_retry'?4:2);assert.equal(writes[0].body.paid,undefined);assert.equal(writes[0].body.invoiceTaxAmount,'12.98');
       await page.getByRole('button',{name:'修改发票信息',exact:true}).click();
       assert.equal(await field('发票号').inputValue(),action==='fallback'?'MANUAL-REVIEW':'TEST-REVIEW');
       assert.equal(await field('税金').inputValue(),'12.98');
       assert.equal(await page.getByText('票面与确认值',{exact:true}).count(),0);
     }
     else if(mode==='supplier'||mode==='settlement'){const saved=await page.evaluate(()=>window.saved);assert.equal(saved.file,'review.xml');assert.equal(saved.form[mode==='supplier'?'invoiceTaxAmount':'taxAmount'],'12.98');if(mode==='settlement'){assert.equal(saved.form.companyEntityId,action==='manual_party'?'unit-default':'unit-1');assert.equal(saved.form.invoiceEntityId,action==='manual_party'?'supplier-default':'supplier-1');}}
     else {assert.equal(writes.length,1);assert.match(writes[0].body,/202609/);assert.match(writes[0].body,/12.98/);const payload=JSON.parse(writes[0].body.match(/name="payload"\r\n\r\n([^\r]+)/)[1]);assert.equal(payload.customerId,['manual_party','fallback'].includes(action)?'customer-default':'customer-1');assert.equal(payload.undertakingUnitId,['manual_party','fallback'].includes(action)?'unit-default':'unit-1');assert.equal(payload.paymentTermDays,expectedTerm);assert.equal(payload.dueDate,expectedDue);assert.equal(payload.invoiceDate,expectedInvoiceDate);}
   }
   assert.deepEqual(errors,[],mode+': console errors');
   results.push(mode+' '+action+' '+device+': PASS'); await page.close();
  }
 }
 }
 console.log(results.join('\n'));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
