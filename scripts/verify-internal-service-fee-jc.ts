// Isolated local integration test. Never loads .env.local and rejects remote hosts.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { randomBytes } from 'node:crypto';

async function main() {
  if (process.env.JC_VERIFY_LOCAL !== '1') throw new Error('Set JC_VERIFY_LOCAL=1 to run against a disposable local MySQL server');
  const port = Number(process.env.JC_VERIFY_PORT ?? 3317);
  const database = `jc_verify_${randomBytes(8).toString('hex')}`;
  const admin = await mysql.createConnection({host:'127.0.0.1',port,user:'root',password:process.env.JC_VERIFY_PASSWORD ?? ''});
  const {closeDb,execute,queryRows} = await import('../src/lib/db');
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_USER:'root',DB_PASSWORD:process.env.JC_VERIFY_PASSWORD ?? '',DB_NAME:database,NODE_ENV:'test',DB_CONNECTION_LIMIT:'1'});
    const schema = await readFile('schema.sql','utf8');
    const wanted = ['countries','requests','billinginstanceledgers','billingadjustments','billingadjustmentitems','monthlybillingwriteoffs','purchaseorderitems','requestitems','internalserviceledgers','monthlyinternalservicefees','internalservicefeeadjustments','internalservicefeesnapshots','internalservicefeesnapshotitems'];
    for (const table of wanted) {
      const start = schema.indexOf('CREATE TABLE IF NOT EXISTS `merge_power_'+table+'`');
      assert.ok(start >= 0,table);
      await execute(schema.slice(start,schema.indexOf(';',start)+1));
    }
    for (const sql of (await readFile('scripts/internal-service-fee-jc.sql','utf8')).split(';').filter(sql=>sql.trim())) await execute(sql);
    await execute("INSERT INTO countries (code,vatRate) VALUES ('BR',0)");
    await execute(`INSERT INTO billinginstanceledgers (ledgerId,purchaseOrderItemId,countryCode,batchName,deviceCode,quantity,contractCurrency,first24MonthPrice,next36MonthPrice,startMonth,requestNo,poNo,nameEn,modelCode,taxExcludedUnitPrice,taxSurcharge)
      VALUES ('verify-ledger','verify-po','BR','BR-3','DEV',32,'USD',100,10,'2024-01-01','REQ','PO','Device','MODEL',0,0)`);
    for(let i=0;i<60;i++) await execute(`INSERT INTO monthlybillingwriteoffs (id,ledgerId,writeOffMonth,monthIndex,monthlyTotalAmount) VALUES (:id,'verify-ledger',DATE_ADD('2024-01-01',INTERVAL :index MONTH),:monthIndex,100)`,{id:`billing-${i}`,index:i,monthIndex:i+1});
    await execute("INSERT INTO billingadjustments (adjustmentNo,status,confirmedAt) VALUES ('JC1','已确认','2026-01-01')");
    await execute("INSERT INTO billingadjustmentitems (id,adjustmentNo,countryCode,batchName,deviceCode,requestNo,quantity,currency,effectiveMonth,adjustedFirst24MonthPrice,adjustedNext36MonthPrice) VALUES ('item-1','JC1','BR','BR-3','DEV','REQ',32,'USD','2025-08-01',90,1)");
    const service = await import('../src/lib/internal-service-fee-jc-service');
    const {regenerateInternalServiceLedger,archiveInternalServiceFees,saveInternalServiceAdjustment,changeInternalServiceAdjustmentStatus} = await import('../src/lib/internal-service-fee-service');
    const {jcComponentId} = await import('../src/lib/internal-service-fee-jc-workflow');
    const id = jcComponentId('verify-ledger','item-1');
    await assert.rejects(()=>service.assertJcReadyToArchive('BR'),/尚未核定/,'unconfirmed candidate must block archive');
    const candidate = await service.getJcDetail(id);
    assert.equal(candidate.component.ruleTotal,-1600);
    assert.equal(candidate.component.status,'待核定');
    assert.equal((await queryRows('SELECT * FROM merge_power_internalservicejccomponents')).length,0,'GET must not write');
    await assert.rejects(()=>service.rollbackJcAdjustment({id,revision:candidate.revision,reason:'未确认不能退回'},'test@example.invalid'),/尚未确认/);
    let current = await service.registerJcHistory({id,revision:candidate.revision,month:'2025-08',amount:-400,reason:'历史登记'},'test@example.invalid');
    assert.equal(current.component.registeredAmount,-400);
    await assert.rejects(()=>service.registerJcHistory({id,revision:current.revision,month:'2025-08',amount:-401,reason:'禁止覆盖'},'test@example.invalid'),/已登记/);
    const input = {id,revision:current.revision,approvedTotal:-1000,reason:'历史遗漏',resumeMonth:'2026-11'};
    const preview = await service.previewJcAdjustment(input);
    assert.equal(preview.component.fixedAdjustment,600);
    assert.equal(preview.months.filter(row=>!row.locked).length,26);
    const concurrent = await Promise.allSettled([service.confirmJcAdjustment(input,'one@example.invalid'),service.confirmJcAdjustment(input,'two@example.invalid')]);
    assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1,'stale concurrent submit must fail');
    current = await service.getJcDetail(id);
    assert.equal(current.component.fixedAdjustment,600);
    assert.equal(current.component.status,'已确认');
    await assert.rejects(()=>service.previewJcAdjustment({...input,revision:current.revision}),/请先退回/);
    assert.equal(current.months.reduce((sum,row)=>sum+Math.round(row.amount*100),0),-100000);
    const [{total}] = await queryRows('SELECT SUM(internalServiceFeeAmount) AS total FROM monthlyinternalservicefees WHERE ledgerId=:id',{id});
    assert.equal(Number(total),-1000,'monthly visible rows agree with JC total');
    const archived = await archiveInternalServiceFees({countryCode:'BR',archiveMonth:'2026-11-01'});
    const snapshotBefore = await queryRows('SELECT * FROM internalservicefeesnapshotitems WHERE snapshotNo=:snapshotNo',{snapshotNo:archived.snapshotNo});
    await execute("INSERT INTO billingadjustments (adjustmentNo,status) VALUES ('JC2','草稿')");
    await execute("INSERT INTO billingadjustmentitems (id,adjustmentNo,countryCode,batchName,deviceCode,requestNo,quantity,currency,effectiveMonth,adjustedFirst24MonthPrice) VALUES ('item-2','JC2','BR','BR-3','DEV','REQ',32,'USD','2025-10-01',80)");
    const {confirmBillingAdjustment,rollbackBillingAdjustment,deleteBillingLedger} = await import('../src/lib/billing-service');
    await confirmBillingAdjustment('JC2');
    await assert.rejects(()=>rollbackBillingAdjustment('JC1'),/不能删除/);
    await assert.rejects(()=>deleteBillingLedger('verify-ledger'),/不能删除/);
    current = await service.getJcDetail(id);
    assert.equal(current.component.fixedAdjustment,600,'fixed historical difference survives repricing');
    assert.equal((await service.getJcDetail(jcComponentId('verify-ledger','item-2'))).component.ruleTotal,-960);
    assert.deepEqual(await queryRows('SELECT * FROM internalservicefeesnapshotitems WHERE snapshotNo=:snapshotNo',{snapshotNo:archived.snapshotNo}),snapshotBefore);
    assert.ok(current.months.find(row=>row.month==='2026-11-01')?.locked);
    await assert.rejects(()=>service.assertJcSourceMutable({ledgerId:'verify-ledger'}),/不能删除/);
    await assert.rejects(()=>service.assertJcSourceMutable({adjustmentNo:'JC1'}),/不能删除/);
    const frozenMonths = current.months.filter(row=>row.locked);
    const confirmedRevision = current.revision;
    await assert.rejects(()=>service.rollbackJcAdjustment({id,revision:candidate.revision,reason:'旧页面'},'test@example.invalid'),/已变化/);
    await assert.rejects(()=>service.rollbackJcAdjustment({id,revision:confirmedRevision,reason:''},'test@example.invalid'),/请填写调整原因/);
    current = await service.rollbackJcAdjustment({id,revision:confirmedRevision,reason:'核对历史总额后重新确认'},'test@example.invalid');
    assert.equal(current.component.status,'已退回');
    assert.equal(current.component.confirmedAt,null);
    assert.equal(current.component.fixedAdjustment,0);
    assert.equal(current.component.baselineRuleTotal,null);
    assert.equal(current.component.approvedTotal,-1000,'returned proposal remains editable');
    assert.equal(current.months.reduce((sum,row)=>sum+Math.round(row.amount*100),0),-160000,'unconfirmed fixed difference no longer applies');
    assert.deepEqual(current.months.filter(row=>row.locked),frozenMonths,'return preserves registered and archived months');
    assert.ok(current.audit.some(row=>row.action==='rollback' && row.actor==='test@example.invalid'));
    assert.deepEqual(await queryRows('SELECT * FROM internalservicefeesnapshotitems WHERE snapshotNo=:snapshotNo',{snapshotNo:archived.snapshotNo}),snapshotBefore);
    await assert.rejects(()=>service.assertJcReadyToArchive('BR'),/已退回/);
    await assert.rejects(()=>service.rollbackJcAdjustment({id,revision:current.revision,reason:'重复退回'},'test@example.invalid'),/已经退回/);
    await assert.rejects(()=>service.previewJcAdjustment({id,revision:current.revision,approvedTotal:'',reason:'无金额',resumeMonth:'2026-12'}),/金额不能为空/);
    await assert.rejects(()=>service.previewJcAdjustment({id,revision:current.revision,approvedTotal:0,reason:'未到期禁止结清',resumeMonth:'2029-01',postingMonth:'2029-01'}),/尚未到期/);
    current = await service.confirmJcAdjustment({...input,revision:current.revision,resumeMonth:'2026-12'},'test@example.invalid');
    assert.equal(current.component.status,'已确认');
    assert.equal(current.component.fixedAdjustment,600);
    assert.deepEqual(current.months.filter(row=>row.locked),frozenMonths);
    assert.equal(current.months.reduce((sum,row)=>sum+Math.round(row.amount*100),0),-100000);
    await service.assertJcReadyToArchive('BR');
    await execute(`INSERT INTO billinginstanceledgers (ledgerId,purchaseOrderItemId,countryCode,batchName,deviceCode,quantity,contractCurrency,first24MonthPrice,next36MonthPrice,startMonth,requestNo,poNo,nameEn,modelCode,taxExcludedUnitPrice,taxSurcharge)
      VALUES ('ended-ledger','ended-po','BR','BR-ended','DEV',32,'USD',100,10,'2019-01-01','REQ','PO','Device','MODEL',0,0)`);
    for(let i=0;i<60;i++) await execute(`INSERT INTO monthlybillingwriteoffs (id,ledgerId,writeOffMonth,monthIndex,monthlyTotalAmount) VALUES (:id,'ended-ledger',DATE_ADD('2019-01-01',INTERVAL :index MONTH),:monthIndex,100)`,{id:`ended-billing-${i}`,index:i,monthIndex:i+1});
    await execute("INSERT INTO billingadjustments (adjustmentNo,status,confirmedAt) VALUES ('JC-ended','已确认','2021-01-01')");
    await execute("INSERT INTO billingadjustmentitems (id,adjustmentNo,countryCode,batchName,deviceCode,requestNo,quantity,currency,effectiveMonth,adjustedFirst24MonthPrice) VALUES ('ended-item','JC-ended','BR','BR-ended','DEV','REQ',32,'USD','2020-08-01',90)");
    const endedId=jcComponentId('ended-ledger','ended-item');
    let endedDetail=await service.getJcDetail(endedId);
    await assert.rejects(()=>service.previewJcAdjustment({id:endedId,revision:endedDetail.revision,approvedTotal:-1000,reason:'不能回摊过去',resumeMonth:'2020-08'}),/合同已经到期/);
    endedDetail=await service.registerJcHistory({id:endedId,revision:endedDetail.revision,month:'2020-08',amount:-400,reason:'历史登记'},'test@example.invalid');
    await assert.rejects(()=>service.assertJcReadyToArchive('BR'),/未分配/);
    const ended = await service.confirmJcAdjustment({id:endedId,revision:endedDetail.revision,approvedTotal:0,reason:'到期结清',resumeMonth:'2026-12',postingMonth:'2026-12'},'test@example.invalid');
    assert.equal(ended.months.filter(row=>!row.locked).length,1);
    assert.equal(ended.months.filter(row=>!row.locked)[0].month,'2026-12-01');
    assert.equal(ended.months.reduce((sum,row)=>sum+Math.round(row.amount*100),0),0);
    const {withInternalFeeTransaction,feeExecute} = await import('../src/lib/internal-service-fee-db');
    await assert.rejects(()=>withInternalFeeTransaction(async()=>{await feeExecute("UPDATE merge_power_internalservicejccomponents SET fixedAdjustment=123 WHERE id=:id",{id});throw new Error('rollback');}),/rollback/);
    assert.equal((await service.getJcDetail(id)).component.fixedAdjustment,600,'failed transaction rolls back');
    // Interval adjustments have a separate draft/confirmed lifecycle.
    await execute("INSERT INTO countries (code,vatRate) VALUES ('CL',0)");
    await execute(`INSERT INTO billinginstanceledgers (ledgerId,purchaseOrderItemId,countryCode,batchName,deviceCode,quantity,contractCurrency,first24MonthPrice,next36MonthPrice,startMonth,requestNo,poNo,nameEn,modelCode,taxExcludedUnitPrice,taxSurcharge)
      VALUES ('interval-ledger','interval-po','CL','CL-test','DEV',1,'USD',100,10,'2024-01-01','REQ','PO','Device','MODEL',0,0)`);
    for(let i=0;i<60;i++) await execute(`INSERT INTO monthlybillingwriteoffs (id,ledgerId,writeOffMonth,monthIndex,monthlyTotalAmount) VALUES (:id,'interval-ledger',DATE_ADD('2024-01-01',INTERVAL :index MONTH),:monthIndex,100)`,{id:`interval-billing-${i}`,index:i,monthIndex:i+1});
    await regenerateInternalServiceLedger('interval-ledger');
    await assert.rejects(()=>saveInternalServiceAdjustment({ledgerId:'interval-ledger',startMonth:'2026-12',endMonth:'2027-01',monthlyAmount:'',reason:'空金额'}),/请填写有效的每月管理费/);
    const interval = await saveInternalServiceAdjustment({ledgerId:'interval-ledger',startMonth:'2026-12',endMonth:'2027-01',monthlyAmount:123.45,reason:'月度调整'});
    assert.equal((await queryRows('SELECT status FROM internalservicefeeadjustments WHERE adjustmentNo=:adjustmentNo',interval))[0].status,'已确认');
    await changeInternalServiceAdjustmentStatus(interval.adjustmentNo,{action:'rollback',reason:'重新核实'},'test@example.invalid');
    assert.equal((await queryRows('SELECT status FROM internalservicefeeadjustments WHERE adjustmentNo=:adjustmentNo',interval))[0].status,'草稿');
    assert.equal((await queryRows('SELECT id FROM monthlyinternalservicefees WHERE adjustmentNo=:adjustmentNo',interval)).length,0,'returned interval stops applying');
    await assert.rejects(()=>changeInternalServiceAdjustmentStatus(interval.adjustmentNo,{action:'confirm',startMonth:'2026-13',endMonth:'2027-01',monthlyAmount:0},'test@example.invalid'),/60个月/);
    await changeInternalServiceAdjustmentStatus(interval.adjustmentNo,{action:'confirm',startMonth:'2026-12',endMonth:'2027-01',monthlyAmount:-12.34,reason:'核实后确认'},'test@example.invalid');
    assert.equal(Number((await queryRows('SELECT internalServiceFeeAmount FROM monthlyinternalservicefees WHERE ledgerId=\'interval-ledger\' AND writeOffMonth=\'2026-12-01\''))[0].internalServiceFeeAmount),-12.34);
    const intervalArchive = await archiveInternalServiceFees({countryCode:'CL',archiveMonth:'2026-12-01'});
    const intervalSnapshot = await queryRows('SELECT * FROM internalservicefeesnapshotitems WHERE snapshotNo=:snapshotNo',{snapshotNo:intervalArchive.snapshotNo});
    await assert.rejects(()=>changeInternalServiceAdjustmentStatus(interval.adjustmentNo,{action:'rollback',reason:'已对账不能退回'},'test@example.invalid'),/已包含对账月份/);
    assert.deepEqual(await queryRows('SELECT * FROM internalservicefeesnapshotitems WHERE snapshotNo=:snapshotNo',{snapshotNo:intervalArchive.snapshotNo}),intervalSnapshot);
    assert.equal((await queryRows('SELECT status FROM internalservicefeeadjustments WHERE adjustmentNo=:adjustmentNo',interval))[0].status,'已确认');
    console.log('PASS: isolated MySQL schema, candidate reads, history locking, concurrent confirmation, return/reconfirm, archived protection, interval adjustments, repricing, ended settlement and transaction rollback');
  } finally {
    await closeDb();
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
