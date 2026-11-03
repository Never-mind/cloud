import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadEnvConfig} from '@next/env';
loadEnvConfig(process.cwd());
async function main(){
 assert.ok(process.argv.includes('--allow-write-test'),'必须明确启用隔离验证');
 assert.ok(['localhost','127.0.0.1'].includes(process.env.DB_HOST||''),'仅能使用本机隔离库');
 assert.match(process.env.DB_NAME||'',/(local|test)/i);
 process.env.OBS_ENABLED='false';
 const db=await import('../src/lib/db'),service=await import('../src/lib/invoice-batch-import-service'),rules=await import('../src/lib/invoice-batch-import'),invoices=await import('../src/lib/invoice-service');
 const tag=`TEST-IMPORT-${randomUUID().slice(0,8)}`,contractId=randomUUID(),cloudIds=[randomUUID(),randomUUID()],feeIds=[tag+'-SF1',tag+'-SF2'];
 const email=tag+'@localhost',access={email,canUse:()=>true},createdBatchIds:string[]=[],checks:string[]=[];
 async function clone(table:string,key:string,id:string,base:Record<string,unknown>,overrides:Record<string,unknown>){
  const columns=await db.queryRowsRaw(`SHOW COLUMNS FROM ${table}`);
  const allowed=columns.filter(row=>!String(row.Extra).includes('auto_increment')&&!String(row.Extra).includes('GENERATED')).map(row=>String(row.Field));
  const row={...base,...overrides,[key]:id};
  const params=Object.fromEntries(allowed.map((field,i)=>[`v${i}`,row[field]??null]));
  await db.executeRaw(`INSERT INTO ${table} (${allowed.map(field=>'`'+field+'`').join(',')}) VALUES (${allowed.map((_,i)=>`:v${i}`).join(',')})`,params);
 }
 try{
  const [customer]=await db.queryRowsRaw("SELECT customerId FROM merge_common_customers WHERE address IS NOT NULL AND address<>'' AND COALESCE(nameEn,name,nameCn) IS NOT NULL LIMIT 1");
  const [unit]=await db.queryRowsRaw("SELECT u.undertakingUnitId FROM merge_common_undertaking_units u JOIN merge_common_undertaking_unit_bank_accounts b ON b.undertakingUnitId=u.undertakingUnitId WHERE b.bankAccount IS NOT NULL AND b.bankAccount<>'' AND COALESCE(NULLIF(u.registeredAddress,''),u.address)<>'' AND u.country<>'' LIMIT 1");
  assert.ok(customer&&unit,'隔离库需要完整开票双方档案');
  const [cloud]=await db.queryRowsRaw('SELECT * FROM merge_cloud_rows LIMIT 1');
  const [fee]=await db.queryRowsRaw("SELECT r.* FROM merge_power_servicefeesnapshots r JOIN merge_power_countries c ON c.code=r.countryCode WHERE c.defaultCustomerId IS NOT NULL AND c.defaultCustomerId<>'' LIMIT 1");
  assert.ok(cloud&&fee);
  for(const [i,id]of cloudIds.entries())await clone('merge_cloud_rows','id',id,cloud,{period:`20260${i+1}`,account:tag,customerId:customer.customerId,undertakingUnitId:unit.undertakingUnitId,customerReceivable:100,customerReceivableNetAmount:100,customerReceivableTaxAmount:0,customerReceivableTotalAmount:100,customerTaxRate:0,invoiceNo:null,invoiceNetAmount:null,invoiceTaxAmount:null,invoiceTotalAmount:null,invoiceCurrency:null,collectionInvoice:'not_issued'});
  for(const [i,id]of feeIds.entries())await clone('merge_power_servicefeesnapshots','snapshotNo',id,fee,{writeOffMonth:`2026-0${i+1}-01`,serviceFeeCurrency:'USD',serviceFeeTotal:100,serviceFeeTotalExcludingTax:100,vatRate:0,invoiceNo:null,invoiceAmountExcludingTax:null,invoiceAmountIncludingTax:null,invoiceCurrency:null,invoiceStatus:'未开票'});
  await db.executeRaw("INSERT INTO merge_power_prepaymentcontracts (contractNo,status,currency,effectiveDate,totalAmount,financeId,financeAmountBasis,financeTaxRate,financeCustomerId,financeUnitId) VALUES (:no,'已确认','USD','2026-01-01',1000,:id,'gross',0,:customer,:unit)",{no:tag,id:contractId,customer:customer.customerId,unit:unit.undertakingUnitId});
  const make=(rowKey:string,module:string,references:string,gross:string)=>rules.normalizeImportRaw({rowKey:tag+'-'+rowKey,module,references,gross,customer:customer.customerId,unit:unit.undertakingUnitId,currency:'USD',taxRate:'0',invoiceDate:'2026-11-03',description:'202601-202602服务费',lineMode:'一行汇总'});
  const rawRows=[make('C1','华为云',cloudIds[0],'60.10'),make('C2','华为云',cloudIds.join(';'),'139.90'),make('S1','算力服务费',feeIds.join(';'),'200.10'),make('P1','预付款合同',tag,'300'),make('P2','预付款合同',tag,'200'),make('BAD','华为云','missing-source','1')];
  async function create(raw:typeof rawRows){const batch=await service.createImportBatch(raw.map((raw,i)=>({rowNo:i+2,raw})),'isolated-test.xlsx','test',access);createdBatchIds.push(batch.id);return batch;}
  const batch=await create(rawRows);
  assert.deepEqual(batch.rows.slice(0,5).map(row=>row.preview.errors),[[],[],[],[],[]]);assert.ok(batch.rows[5].preview.errors.length);checks.push('三个模块预览、无效单据阻断与客户确认差额');
  const before=await db.queryRowsRaw('SELECT id FROM merge_common_invoices WHERE importBatchId=:id',{id:batch.id});assert.equal(before.length,0);checks.push('上传预览不生成正式发票');
  for(const row of batch.rows.slice(0,5)){const result=await service.executeImportRow(batch.id,row.id,row.version,access,{name:'隔离批量开票验证'});assert.equal(result.status,'issued',result.message);}
  const done=await service.getImportBatch(batch.id,access);assert.equal(done.rows.filter(row=>row.invoiceId).length,5);
  const [cloudSummary]=await db.queryRowsRaw('SELECT invoiceTotalAmount,customerReceivableTotalAmount FROM merge_cloud_rows WHERE id=:id',{id:cloudIds[0]});assert.equal(Number(cloudSummary.invoiceTotalAmount),130.05);assert.equal(Number(cloudSummary.customerReceivableTotalAmount),100);
  const [feeSummary]=await db.queryRowsRaw('SELECT invoiceAmountIncludingTax,serviceFeeTotal FROM merge_power_servicefeesnapshots WHERE snapshotNo=:id',{id:feeIds[0]});assert.equal(Number(feeSummary.invoiceAmountIncludingTax),100.05);assert.equal(Number(feeSummary.serviceFeeTotal),100);checks.push('一账期多票、多账期一票分摊且不改业务应收');
  const p=await (await import('../src/lib/prepayment-finance-service')).getPrepaymentFinance(tag);assert.equal(p.summary.invoiced,500);assert.equal(p.summary.received,0);checks.push('同合同多票累计且不产生收款');
  const repeated=await service.executeImportRow(batch.id,batch.rows[0].id,batch.rows[0].version,access,{});assert.equal(repeated.invoiceId,done.rows[0].invoiceId);
  const duplicate=await create([rawRows[0]]);assert.ok(duplicate.rows[0].preview.existingInvoiceId);assert.equal((await service.executeImportRow(duplicate.id,duplicate.rows[0].id,1,access,{})).status,'skipped');checks.push('重复请求与跨批次重复上传不重复开票');
  const conflict=await create([{...rawRows[0],gross:'70'}]);assert.match(conflict.rows[0].preview.errors.join(''),/内容不同/);checks.push('相同导入编号不同金额阻断');
  await assert.rejects(service.getImportBatch(batch.id,{...access,email:'other@localhost'}),/无权/);
  const denied=await service.prepareImportRow(make('DENIED','华为云',cloudIds[0],'1'),{email,canUse:()=>false});assert.match(denied.preview.errors.join(''),/权限/);checks.push('批次归属及业务模块权限校验');
  const fixed=await service.updateImportRow(batch.id,batch.rows[5].id,make('BAD','华为云',cloudIds[1],'1'),1,access);assert.equal(fixed.rows[5].preview.errors.length,0);
  await assert.rejects(service.executeImportRow(batch.id,batch.rows[5].id,1,access,{}),/已变化/);checks.push('失败行可修正，旧版本不能提交');
  const changed=await create([make('CHANGED','华为云',cloudIds[1],'1')]);
  await db.executeRaw('UPDATE merge_cloud_rows SET customerReceivableTotalAmount=101 WHERE id=:id',{id:cloudIds[1]});
  const stale=await service.executeImportRow(changed.id,changed.rows[0].id,1,access,{});
  assert.equal(stale.status,'error');assert.match(stale.message,/已变化/);
  assert.equal((await db.queryRowsRaw('SELECT id FROM merge_common_invoices WHERE importBatchId=:id',{id:changed.id})).length,0);
  checks.push('预览后来源金额变化阻断，防止按过期预览开票');
  const automaticRaw={...make('AUTO','预付款合同',tag,'5'),rowKey:'',unit:'',taxRate:'',invoiceDate:''};
  const automatic=await create([automaticRaw,automaticRaw]);
  assert.equal(automatic.rows[0].raw.unit,rules.DEFAULT_IMPORT_UNIT);assert.equal(automatic.rows[0].raw.taxRate,'0');assert.equal(automatic.rows[0].raw.invoiceDate,rules.importUploadDate());
  assert.notEqual(automatic.rows[0].raw.rowKey,automatic.rows[1].raw.rowKey);assert.equal(automatic.rows[0].preview.errors.length,0);checks.push('无导入编号模板自动编号，香港万众、零税及上传日期默认值');
  await db.executeRaw('UPDATE merge_common_invoice_import_batches SET createdAt=DATE_ADD(createdAt,INTERVAL 1 DAY) WHERE id=:id',{id:automatic.id});
  const revised=await service.updateImportRow(automatic.id,automatic.rows[0].id,{...automatic.rows[0].raw,rowKey:'client-change',gross:'3',unit:'',taxRate:'',invoiceDate:''},1,access);
  assert.equal(revised.rows[0].raw.rowKey,automatic.rows[0].raw.rowKey);assert.equal(revised.rows[0].raw.invoiceDate,automatic.rows[0].raw.invoiceDate);
  for(const row of revised.rows)assert.equal((await service.executeImportRow(revised.id,row.id,row.version,access,{})).status,'issued');
  const restored=await create([automaticRaw,automaticRaw]);assert.equal(restored.id,automatic.id);assert.equal(restored.restored,true);assert.equal(restored.rows[0].raw.gross,'3');assert.ok(restored.rows.every(row=>row.invoiceId));checks.push('重传恢复批次与已编辑内容，系统编号不可篡改');
  const appended=await create([automaticRaw,automaticRaw,{...automaticRaw,gross:'6'}]);
  for(const row of appended.rows.slice(0,2))assert.equal((await service.executeImportRow(appended.id,row.id,row.version,access,{})).status,'skipped');
  assert.equal(appended.rows[2].preview.errors.length,0);checks.push('表格新增行后，原已开票行仍自动跳过');
  await invoices.voidInvoice(String(done.rows[0].invoiceId),'isolated test');
  await assert.rejects(invoices.deleteInvoice(String(done.rows[0].invoiceId)),/导入编号/);
  const voided=await create([rawRows[0]]);assert.match(voided.rows[0].preview.errors.join(''),/作废/);checks.push('作废发票保留导入编号避免重导');
  console.log(JSON.stringify({database:process.env.DB_NAME,passed:checks.length,checks},null,2));
 }finally{
  // Only random fixture source IDs and this invocation's batch IDs can be deleted.
  for(const id of [...cloudIds,...feeIds,contractId]){
   const rows=await db.queryRowsRaw('SELECT id FROM merge_common_invoices WHERE sourceId=:id',{id});
   for(const invoice of rows){for(const table of ['merge_common_invoice_items','merge_common_invoice_allocations','merge_common_invoice_business_links'])await db.executeRaw(`DELETE FROM ${table} WHERE invoiceId=:id`,{id:invoice.id});await db.executeRaw('DELETE FROM merge_common_invoices WHERE id=:id',{id:invoice.id});}
   await db.executeRaw('DELETE FROM merge_cloud_attachments WHERE ownerId=:id',{id});
  }
  for(const id of cloudIds)await db.executeRaw('DELETE FROM merge_cloud_rows WHERE id=:id',{id});
  for(const id of feeIds)await db.executeRaw('DELETE FROM merge_power_servicefeesnapshots WHERE snapshotNo=:id',{id});
  await db.executeRaw('DELETE FROM merge_power_prepaymentcontracts WHERE financeId=:id',{id:contractId});
  for(const id of createdBatchIds){await db.executeRaw('DELETE FROM merge_common_invoice_import_rows WHERE batchId=:id',{id});await db.executeRaw('DELETE FROM merge_common_invoice_import_batches WHERE id=:id',{id});}
  await db.closeDb();
 }
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
