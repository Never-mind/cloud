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
const { chromium } = require(require.resolve('playwright', { paths: [root, runtime] }));
const harness = [
  "import React,{useState} from 'react';import{createRoot}from'react-dom/client';",
  "import{InvoiceDraftModal}from'./src/components/invoice-draft-modal';import{InvoiceApprovalProgress}from'./src/components/invoice-approval-progress';",
  "function App(){const p=new URLSearchParams(location.search);const[open,setOpen]=useState(true);if(p.has('review'))return <main className='p-4'><InvoiceApprovalProgress/></main>;return open?<InvoiceDraftModal open mode='generated' sourceType={p.get('source')||'cloud_row'} sourceId='source' onClose={()=>setOpen(false)} onSaved={()=>{}}/>:<div>Closed</div>;}createRoot(document.getElementById('root')).render(<App/>);",
].join('\n');
const bundle = await build({ stdin: { contents: harness, loader: 'tsx', resolveDir: root }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', alias: { '@': resolve(root,'src') }, define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'mock-notices', setup(plugin) {
  plugin.onLoad({filter:/app-dialog\.tsx$/},()=>({contents:'export const notify=(...args)=>{window.notices??=[];window.notices.push(args)};export const confirmDialog=async()=>true;',loader:'js'}));
} }] });
const css = (await postcss([tailwind()]).process(await readFile('src/app/globals.css','utf8'), { from: resolve(root,'src/app/globals.css') })).css;
const server = createServer((req,res)=>{
  if(req.url.startsWith('/bundle.js')){res.setHeader('Content-Type','application/javascript');res.end(bundle.outputFiles[0].text);}
  else if(req.url.startsWith('/style.css')){res.setHeader('Content-Type','text/css');res.end(css);}
  else {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const baseUrl = 'http://127.0.0.1:'+server.address().port;
const browser = await chromium.launch({headless:true,channel:'msedge'});
const output = resolve(root,'docs/invoice-approval/verification');
await mkdir(output,{recursive:true});
const base = {sourceId:'source',sourceNo:'202603 - TEST',period:'202603',customerId:'customer',undertakingUnitId:'unit',invoiceDate:'2026-03-25',paymentTermDays:30,dueDate:'2026-04-24',currency:'CNY',exchangeRate:'1',amountExcludingTax:'100',taxRate:'6',taxAmount:'6',amountIncludingTax:'106',lines:[]};
const cloud = {...base,branch:'mx',companyText:'Cloud company',suggestedPurpose:'Original cloud purpose',suggestedInvoiceContent:'Service',paymentReceivedTime:'2026-04-24',amountCurrencyOptions:['CNY'],customer:{name:'Customer',taxId:'TAX',address:'Address',taxRegime:'Regime',postCode:'100000'},customerAttachments:[],options:{paymentMethods:[],cfdiCodes:[],chileInvoiceTypes:[],chileNote2:[]},blockers:[],warnings:[]};
const vat = {sourceNo:base.sourceNo,period:base.period,draft:{companyKey:'company',invoiceType:'special',customerName:'Customer',taxId:'TAX',address:'Address',phone:'12345678',bankName:'Bank',bankAccount:'123456',months:['march'],payments:['post'],paymentTermDays:'30',amountIncludingTax:'106',amountExcludingTax:'100',taxRate:'6',taxAmount:'6',attachmentIds:[]},options:{group:{value:'group',label:'CLOUD'},companies:[{value:'company',label:'Domestic company'}],months:[{value:'march',label:'3月'},{value:'april',label:'4月'}],payments:[{value:'post',label:'后付'}]},attachments:[],blockers:[],existingApproval:null};
const match = (id,name)=>({status:'matched',via:'税号',id,name,candidates:[{id,name}]});
const recognition = {source:'PDF',kind:'VAT',exact:true,fields:[],warnings:[],facts:{...base,invoiceNo:'12345678901234567890',issuerName:'Unit',issuerTaxNumber:'UNIT-TAX',receiverName:'Customer',receiverTaxNumber:'TAX'},matches:{issuerUnitId:'unit',receiverCustomerId:'customer'},partyMatches:{issuerUnit:match('unit','Unit'),receiverCustomer:match('customer','Customer')},form:{}};
const results=[];
const materialOptions = [
  { source:'customer',attachmentId:'csf',fileName:'客户CSF.pdf',fileSize:3,sourceLabel:'客户档案' },
  { source:'cloud_row',attachmentId:'bill',fileName:'202610账期账单.pdf',fileSize:3,sourceLabel:'华为云账期账单' },
  { source:'settlement_project',attachmentId:'contract',fileName:'项目合同-长文件名用于验证移动端附件列表不会溢出.pdf',fileSize:3,sourceLabel:'项目附件' },
];
try {
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  for(const scenario of ['cloud_row','billing_statement','service_fee','settlement_invoice','blocked','approved','pending','failed','registered','usd','usd_return','usd_return_failed','usd_return_mismatch','attachment_cloud','attachment_vat','attachment_empty','attachment_cl','attachment_retry'].filter(value=>!process.env.APPROVAL_SCENARIO||value===process.env.APPROVAL_SCENARIO)) {
    const page=await browser.newPage({viewport}); const errors=[]; const writes=[];
    page.on('pageerror',error=>errors.push(error.message));
    const usd=scenario.startsWith('usd');
    const reviewing=['approved','pending','failed','registered','usd_return','usd_return_failed','usd_return_mismatch'].includes(scenario);
    const failed=scenario==='failed'||scenario==='usd_return_failed';
    const sourceBase={...base,...(usd?{currency:'USD',exchangeRate:'1'}:{})};
    const sourceVat={...vat,currency:'CNY',sourceCurrency:sourceBase.currency,sourceAmountIncludingTax:sourceBase.amountIncludingTax,draft:{...vat.draft,...(usd?{amountExcludingTax:'',taxAmount:'',amountIncludingTax:''}:{})}};
    const returnedRecognition=usd?{...recognition,facts:{...recognition.facts,currency:'CNY',amountExcludingTax:scenario==='usd_return_mismatch'?'800':'700',taxAmount:scenario==='usd_return_mismatch'?'48':'42',amountIncludingTax:scenario==='usd_return_mismatch'?'848':'742'}}:recognition;
    const primary={id:'file',fileName:'invoice_12345678901234567890.pdf',invoiceNo:'12345678901234567890',invoiceIdentity:'identity',invoiceId:scenario==='registered'?'posted':'',recognition:failed?null:returnedRecognition,recognitionError:failed?'No selectable text':''};
    const group={key:'identity',primary,files:[primary],registered:scenario==='registered',conflicting:false};
    const approval={instanceCode:'instance',serialNumber:'202603250008',approvalCode:'9BF45F81-882F-4C8C-9E7B-E19CC959F294',ownerNo:base.sourceNo,status:scenario==='pending'?'pending':'approved',invoiceId:scenario==='registered'?'posted':'',groups:[group],invoiceParseJson:JSON.stringify({nodes:[{name:'财务审批',status:'APPROVED'},{name:'办理-票据发送',status:'PENDING'}]})};
    await page.route('**/api/**',async route=>{
      const request=route.request(),url=new URL(request.url());let data={};
      if(request.method()==='POST') { writes.push({url:url.pathname,body:request.postDataJSON()}); data={ok:true,invoice:{id:'posted'},instanceCode:'mock-only'}; }
      else if(url.pathname.includes('/entities/undertaking-units/')) {data={undertakingUnitId:'unit',paymentTermDays:30};}
      else if(url.pathname.includes('/entities/')) {data={rows:url.pathname.endsWith('customers')?[{customerId:'customer',name:'Customer'}]:[{undertakingUnitId:'unit',name:'Unit'}],total:1};}
      else if(url.pathname==='/api/invoices/approval/returns') {
        data=url.searchParams.has('fileId')?{approval:{...approval,sourceType:'cloud_row',sourceId:'source'},base:sourceBase,group,expectedInvoice:usd?{currency:'CNY',amountIncludingTax:'742'}:null,confirmed:scenario==='registered'?{invoiceNo:'MANUAL-CORRECTED',...base,amountIncludingTax:'212',amountExcludingTax:'200',taxAmount:'12'}:null}:{approvals:reviewing?[approval]:[]};
      } else if(url.pathname==='/api/invoices/approval/prefill') { data=url.searchParams.get('flow')==='vat'?{...sourceVat,attachmentOptions:scenario==='attachment_empty'?[]:materialOptions,blockers:scenario==='blocked'?['后台节点尚未配置']:[]}:{...cloud,attachmentOptions:materialOptions,attachmentField:{id:'csf',name:'CSF'},...(scenario==='attachment_cl'?{branch:'cl',attachmentField:null}:{})}; }
      else if(url.pathname==='/api/invoices/prefill') data=sourceBase;
      else throw new Error('Unexpected API '+url.pathname);
      const retryFailure=scenario==='attachment_retry'&&request.method()==='POST'&&writes.length===1;
      await route.fulfill({status:retryFailure?400:200,contentType:'application/json',body:JSON.stringify(retryFailure?{error:'测试上传失败，请重试'}:data)});
    });
    await page.goto(baseUrl+'/?'+(reviewing?'review=1':'source='+(scenario==='blocked'||usd||scenario.startsWith('attachment_')?'cloud_row':scenario)));
    if(scenario.startsWith('attachment_')) {
      await page.getByRole('button',{name:'飞书审批开票',exact:true}).click();
      const submit=page.getByRole('button',{name:'提交飞书审批',exact:true});
      if(scenario==='attachment_cl') {
        await page.getByText('飞书 Cloud 智利分支尚未配置附件栏',{exact:false}).waitFor();
        assert.equal(await page.getByRole('button',{name:'选择文件',exact:true}).count(),0);
      } else {
        const isCloud=scenario==='attachment_cloud';
        if(!isCloud) await page.getByRole('tab',{name:'增值税开票申请',exact:true}).click();
        const materials=page.locator('section[aria-label="审批材料"]:visible');
        await materials.getByRole('button',{name:'从单据选择',exact:true}).click();
        assert.equal(await submit.isDisabled(),true);
        if(scenario==='attachment_empty') {
          await materials.getByText('当前单据暂无已有附件').waitFor();
          await materials.getByRole('button',{name:'取消',exact:true}).click();
        } else {
          await materials.getByLabel('搜索附件',{exact:true}).fill('客户');
          await materials.getByLabel('客户CSF.pdf',{exact:true}).check();
          await materials.getByLabel('搜索附件',{exact:true}).fill('');
          await materials.getByLabel(isCloud?'华为云账期账单全选':'项目附件全选',{exact:true}).check();
          await materials.getByRole('button',{name:'确定选择',exact:true}).click();
          assert.equal(await materials.getByRole('button',{name:'移除 客户CSF.pdf',exact:true}).count(),1);
          if(isCloud) await materials.getByLabel('客户CSF.pdf 客户 CSF',{exact:true}).check();
          await materials.getByRole('button',{name:'从单据选择',exact:true}).click();
          await materials.getByLabel('客户CSF.pdf',{exact:true}).uncheck();
          await materials.getByRole('button',{name:'取消',exact:true}).click();
          assert.equal(await materials.getByRole('button',{name:'移除 客户CSF.pdf',exact:true}).count(),1);
        }
        await materials.getByLabel('上传审批材料',{exact:true}).setInputFiles({name:'empty.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(0)});
        await materials.getByRole('alert').filter({hasText:'附件不能为空'}).waitFor();
        assert.equal(writes.length,0);
        if(scenario==='attachment_vat') await page.evaluate(()=>{
          const original=FileReader.prototype.readAsDataURL;
          FileReader.prototype.readAsDataURL=function(file){
            FileReader.prototype.readAsDataURL=original;
            window.finishPendingRead=()=>original.call(this,file);
          };
        });
        await materials.getByLabel('上传审批材料',{exact:true}).setInputFiles([{name:'新增材料.pdf',mimeType:'application/pdf',buffer:Buffer.from('pdf')},{name:'删除材料.pdf',mimeType:'application/pdf',buffer:Buffer.from('pdf')}]);
        if(scenario==='attachment_vat') {
          await page.waitForFunction(()=>typeof window.finishPendingRead==='function');
          assert.equal(await submit.isDisabled(),true);
          assert.equal(await page.getByRole('tab',{name:'Cloud Invoice Process',exact:true}).isDisabled(),true);
          await page.getByLabel('客户公司名称',{exact:true}).fill('Edited while reading');
          await page.evaluate(()=>window.finishPendingRead());
        }
        await materials.getByRole('button',{name:'移除 删除材料.pdf',exact:true}).click();
        assert.equal(await materials.getByRole('button',{name:'移除 新增材料.pdf',exact:true}).count(),1);
        await page.getByRole('tab',{name:isCloud?'增值税开票申请':'Cloud Invoice Process',exact:true}).click();
        assert.equal(await page.locator('section[aria-label="审批材料"]:visible').getByRole('button',{name:'移除 新增材料.pdf',exact:true}).count(),0);
        await page.getByRole('tab',{name:isCloud?'Cloud Invoice Process':'增值税开票申请',exact:true}).click();
        if(!isCloud) {
          await page.getByRole('button',{name:'刷新选项',exact:true}).click();
          await page.waitForFunction(()=>!document.body.textContent.includes('正在读取增值税审批表单'));
        }
        assert.equal(await materials.getByRole('button',{name:'移除 新增材料.pdf',exact:true}).count(),1);
        await materials.scrollIntoViewIfNeeded();
        await page.screenshot({path:resolve(output,scenario+'-'+viewport.width+'.png')});
        await submit.click();
        if(scenario==='attachment_retry') {
          await page.waitForFunction(()=>window.notices?.some(item=>item[0].includes('测试上传失败')));
          assert.equal(await materials.getByRole('button',{name:'移除 新增材料.pdf',exact:true}).count(),1);
          await page.getByLabel('客户公司名称',{exact:true}).fill('Retry customer');
          await submit.click();
        }
        await page.getByText('Closed',{exact:true}).waitFor();
        const submitted=writes.at(-1).body;
        const selection=isCloud?submitted:submitted.draft;
        assert.equal(selection.attachments.length,1);assert.equal(selection.attachments[0].fileName,'新增材料.pdf');
        assert.equal((selection.attachmentRefs ?? []).length,scenario==='attachment_empty'?0:2);
        if(isCloud) assert.equal(selection.attachmentRefs.find(ref=>ref.attachmentId==='csf').isCsf,true);
        if(scenario==='attachment_retry') assert.equal(submitted.draft.customerName,'Retry customer');
        if(scenario==='attachment_vat') assert.equal(submitted.draft.customerName,'Edited while reading');
      }
    } else if(!reviewing) {
      await page.getByRole('button',{name:'飞书审批开票',exact:true}).click();
      const purpose=page.locator('label').filter({hasText:'用途说明 Purpose'}).locator('textarea');
      await purpose.fill('Independent cloud draft');
      await page.getByRole('tab',{name:'增值税开票申请',exact:true}).click();
      await page.getByLabel('客户公司名称',{exact:true}).fill('Edited VAT Customer');
      if(usd) {
        assert.equal(await page.getByLabel('来源币种',{exact:true}).inputValue(),'USD');
        assert.equal(await page.getByLabel('来源含税金额',{exact:true}).inputValue(),'106');
        assert.equal(await page.getByLabel('开票币种',{exact:true}).inputValue(),'CNY');
        assert.equal(await page.getByLabel('开票金额（含税）',{exact:true}).inputValue(),'');
      }
      await page.getByRole('textbox',{name:'未税金额',exact:true}).fill(usd?'700':'200');
      assert.equal(Number(await page.getByLabel('开票金额（含税）',{exact:true}).inputValue()),usd?742:212);
      if(usd) {
        await page.getByLabel('开票金额（含税）',{exact:true}).fill('742');
        assert.equal(Number(await page.getByRole('textbox',{name:'未税金额',exact:true}).inputValue()),700);
      }
      await page.getByLabel('普票',{exact:true}).check();
      assert.equal(await page.getByLabel('开户行',{exact:true}).count(),0);
      await page.getByLabel('专票',{exact:true}).check();
      assert.equal(await page.getByLabel('开户行',{exact:true}).inputValue(),'Bank');
      await page.getByRole('tab',{name:'Cloud Invoice Process',exact:true}).click();
      assert.equal(await purpose.inputValue(),'Independent cloud draft');
      await page.getByRole('tab',{name:'增值税开票申请',exact:true}).click();
      await page.getByRole('button',{name:'本地开票',exact:true}).click();
      await page.getByRole('button',{name:'飞书审批开票',exact:true}).click();
      assert.equal(await page.getByLabel('客户公司名称',{exact:true}).inputValue(),'Edited VAT Customer');
      await page.getByRole('button',{name:'刷新选项',exact:true}).click();
      await page.waitForFunction(()=>!document.body.textContent.includes('正在读取增值税审批表单'));
      assert.equal(await page.getByLabel('客户公司名称',{exact:true}).inputValue(),'Edited VAT Customer');
      for(const title of ['审批人员','客户对接人','票据发送办理人']) assert.equal(await page.getByLabel(title,{exact:true}).count(),0);
      const submit=page.getByRole('button',{name:'提交飞书审批',exact:true});
      if(scenario==='blocked') assert.equal(await submit.isDisabled(),true);
      else {assert.equal(await submit.isEnabled(),true);}
      if(scenario==='cloud_row') await page.screenshot({path:resolve(output,'vat-'+viewport.width+'.png')});
      if(scenario==='usd') {
        await page.getByLabel('开票金额（含税）',{exact:true}).scrollIntoViewIfNeeded();
        await page.screenshot({path:resolve(output,'vat-usd-cny-'+viewport.width+'.png')});
      }
      if(scenario!=='blocked') {
        await submit.click(); await page.getByText('Closed',{exact:true}).waitFor();
        assert.equal(writes.length,1);assert.equal(writes[0].body.flow,'vat');assert.equal(Number(writes[0].body.draft.amountIncludingTax),usd?742:212);
      }
    } else {
      await page.getByRole('button',{name:scenario==='registered'?'查看发票':'核对发票',exact:true}).click();
      const dialog=page.getByRole('dialog').last();
      await dialog.getByLabel('发票号',{exact:true}).waitFor();
      const confirm=dialog.getByRole('button',{name:'确认并登记发票',exact:true});
      assert.equal(await confirm.isDisabled(),true); assert.equal(writes.length,0);
      if(usd) {
        assert.equal(await dialog.getByLabel('币种',{exact:true}).inputValue(),'CNY');
        assert.equal(await dialog.getByLabel('汇率',{exact:true}).inputValue(),'');
        assert.equal(await dialog.getByText('发票含税金额与来源单据不同，请核对',{exact:false}).count(),0);
        assert.equal(await dialog.getByText('发票含税金额与开票申请不同，请核对',{exact:false}).count(),scenario==='usd_return_mismatch'?1:0);
      }
      if(scenario==='registered') assert.equal(await dialog.getByLabel('发票号',{exact:true}).inputValue(),'MANUAL-CORRECTED');
      else if(scenario!=='pending') {
        if(failed) {
          await dialog.getByLabel('发票号',{exact:true}).fill('MANUAL-FAILOVER');
          await dialog.getByLabel('开票日期',{exact:true}).fill('2026-03-25');
          for(const [label,name] of [['开票主体','Unit'],['客户','Customer']]) {
            const input=dialog.locator('label').filter({hasText:new RegExp('^'+label+'$')}).locator('input');
            await input.fill(name); await page.locator('[data-search-select-panel] button').filter({hasText:name}).first().click();
          }
          await dialog.getByLabel('税率（%）',{exact:true}).fill('6');
        }
        await dialog.getByLabel('未税金额',{exact:true}).fill(usd?'700':'200');
        assert.equal(Number(await dialog.getByLabel('含税金额',{exact:true}).inputValue()),usd?742:212);
        await dialog.getByLabel('账期（天）',{exact:true}).fill('30');
        assert.equal(await dialog.getByLabel('到期日',{exact:true}).inputValue(),'2026-04-24');
        await dialog.getByRole('checkbox').check();assert.equal(await confirm.isEnabled(),true);
        await dialog.getByLabel('发票号',{exact:true}).fill('CONFIRMED-CORRECTION');
        assert.equal(await confirm.isDisabled(),true);
        await dialog.getByRole('checkbox').check();
        if(scenario==='approved') await page.screenshot({path:resolve(output,'return-review-'+viewport.width+'.png')});
        await confirm.click();await dialog.waitFor({state:'hidden'});
        assert.equal(writes.length,1);assert.equal(writes[0].body.draft.invoiceNo,'CONFIRMED-CORRECTION');
        if(usd) {assert.equal(writes[0].body.draft.currency,'CNY');assert.equal(Number(writes[0].body.draft.amountIncludingTax),742);}
      }
    }
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    results.push({viewport:viewport.width,scenario,passed:true});await page.close();
  }
}
console.log(JSON.stringify({cases:results.length,results},null,2));
} finally {await browser.close(); await new Promise(resolve=>server.close(resolve));}
