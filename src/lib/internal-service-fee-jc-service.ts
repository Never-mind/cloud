import { createHash, randomUUID } from 'node:crypto';
import { type Row } from './db';
import { currentPeriodMonth } from './exchange-rate-service';
import { normalizeCurrencyCode, resolveExchangeRate } from './exchange-rate-service';
import { feeQuery as query, feeExecute as execute, withInternalFeeTransaction } from './internal-service-fee-db';
import { calculateJcTotals, contractMonth, jcCents, jcComponentId, parseJcMonth, projectJcMonths, type JcMonth } from './internal-service-fee-jc-workflow';

const COMPONENTS = 'merge_power_internalservicejccomponents';
const MONTHS = 'merge_power_internalservicejcmonths';
const AUDIT = 'merge_power_internalservicejcaudit';
export async function jcSchemaAvailable() {
  // Use the active transaction connection, including when the pool has one slot.
  const rows = await query<Row>("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table AND COLUMN_NAME='fixedAdjustment' LIMIT 1", {table:COMPONENTS});
  return rows.length > 0;
}

type Component = Row & {
  id: string; ledgerId: string; itemId: string; adjustmentNo: string; countryCode: string; batchName: string; deviceCode: string; currency: string;
  reportingCurrency: string; exchangeRate: number;
  effectiveMonth: string; endMonth: string; ruleTotal: number; baselineRuleTotal: number | null; approvedTotal: number | null;
  ruleTotalReporting: number; approvedTotalReporting: number | null; fixedAdjustment: number; fixedAdjustmentReporting: number;
  resumeMonth: string; postingMonth: string | null; reason: string; version: number;
  issue: string; confirmedAt: string | null; confirmedBy: string | null; status: '待核定' | '已确认' | '已退回';
};

async function requireSchema() {
  if (!await jcSchemaAvailable()) throw new Error('请先执行管理费JC增量迁移：npm run schema:internal-fee-jc -- --apply');
}

// Read candidates without initializing or rewriting any financial data.
async function candidates(ledgerId?: string): Promise<Component[]> {
  const rows = await query<Row>(`
    SELECT b.ledgerId,b.countryCode,b.batchName,b.deviceCode,b.quantity AS ledgerQuantity,b.contractCurrency AS currency,
      DATE_FORMAT(b.startMonth,'%Y-%m-%d') AS startMonth,b.first24MonthPrice,COALESCE(c.vatRate,b.vatRate,0) AS vatRate,
      i.id AS itemId,i.adjustmentNo,i.quantity,i.currency AS changeCurrency,DATE_FORMAT(i.effectiveMonth,'%Y-%m-%d') AS effectiveMonth,
      i.adjustedFirst24MonthPrice,a.confirmedAt,
      internal.reportingCurrency,internal.exchangeRate
    FROM billinginstanceledgers b
    JOIN billingadjustmentitems i ON i.countryCode=b.countryCode AND i.batchName=b.batchName
      AND i.deviceCode=b.deviceCode AND (i.requestNo=b.requestNo OR i.requestNo='')
    JOIN billingadjustments a ON a.adjustmentNo=i.adjustmentNo AND a.confirmedAt IS NOT NULL
    LEFT JOIN countries c ON c.code=b.countryCode
    LEFT JOIN internalserviceledgers internal ON internal.ledgerId=b.ledgerId
    ORDER BY b.ledgerId,a.confirmedAt,i.adjustmentNo,i.id`);
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    if (ledgerId && row.ledgerId !== ledgerId) continue;
    const group = grouped.get(String(row.ledgerId)) ?? [];
    group.push(row); grouped.set(String(row.ledgerId), group);
  }
  const saved = await query<Row>(`SELECT *,DATE_FORMAT(effectiveMonth,'%Y-%m-%d') AS effectiveMonth,
    DATE_FORMAT(endMonth,'%Y-%m-%d') AS endMonth,DATE_FORMAT(resumeMonth,'%Y-%m-%d') AS resumeMonth,
    DATE_FORMAT(postingMonth,'%Y-%m-%d') AS postingMonth FROM ${COMPONENTS} ${ledgerId ? 'WHERE ledgerId=:ledgerId' : ''}`, ledgerId ? {ledgerId} : {});
  const savedById = new Map(saved.map((row) => [String(row.id), row]));
  const matchedQuantity = new Map<string,number>();
  for (const row of rows) matchedQuantity.set(String(row.itemId),(matchedQuantity.get(String(row.itemId)) ?? 0)+Number(row.ledgerQuantity));
  const result: Component[] = [];
  for (const [sourceLedgerId, group] of grouped) {
    const base = group[0];
    const startMonth = parseJcMonth(base.startMonth);
    if (!startMonth) throw new Error(`合同 ${sourceLedgerId} 缺少有效起始月`);
    const currency = String(base.currency).toUpperCase();
    const reportingCurrency = normalizeCurrencyCode(base.reportingCurrency) || currency;
    let exchangeRate = Number(base.exchangeRate);
    if (currency !== reportingCurrency) {
      if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
        exchangeRate = await resolveExchangeRate(startMonth, reportingCurrency, currency) ?? 0;
      }
      if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) throw new Error(`缺少 ${reportingCurrency}→${currency} 汇率，无法初始化 JC`);
    } else {
      exchangeRate = 1;
    }
    const totals = calculateJcTotals({startMonth,quantity:Number(base.ledgerQuantity),first24UnitPrice:Number(base.first24MonthPrice),vatRate:Number(base.vatRate),
      changes:group.map((row) => ({itemId:String(row.itemId),adjustmentNo:String(row.adjustmentNo),effectiveMonth:String(row.effectiveMonth),quantity:Number(row.quantity),first24UnitPrice:Number(row.adjustedFirst24MonthPrice)}))});
    for (const total of totals) {
      const id = jcComponentId(sourceLedgerId,total.itemId);
      const old = savedById.get(id);
      const source = group.find((row) => row.itemId === total.itemId)!;
      // Do not mix contract currencies or silently allocate an ambiguous source line.
      const issue = Number(source.quantity)>0 && Number(source.quantity)<Number(matchedQuantity.get(total.itemId)) && rows.filter(row=>row.itemId===total.itemId).length>1 ? '该调整明细只调整部分数量，但匹配多个合同，请先明确各合同受影响数量' :
        String(source.changeCurrency).toUpperCase() !== currency ? '调价币种与原合同不同，请先核对合同币种' :
        group.filter((row) => row.adjustmentNo === total.adjustmentNo).length > 1 ? '同一调整单有多条明细匹配该合同，请先核对来源明细' : '';
      result.push({id,ledgerId:sourceLedgerId,itemId:total.itemId,adjustmentNo:total.adjustmentNo,countryCode:String(base.countryCode),batchName:String(base.batchName),deviceCode:String(base.deviceCode),currency,
        reportingCurrency,exchangeRate,effectiveMonth:total.effectiveMonth,endMonth:contractMonth(startMonth,59),ruleTotal:total.ruleTotal,
        baselineRuleTotal:old?.baselineRuleTotal == null ? null : Number(old.baselineRuleTotal),approvedTotal:old?.approvedTotal == null ? null : Number(old.approvedTotal),fixedAdjustment:Number(old?.fixedAdjustment ?? 0),
        ruleTotalReporting:jcCents(total.ruleTotal/exchangeRate)/100,approvedTotalReporting:old?.approvedTotalReporting == null ? null : Number(old.approvedTotalReporting),
        fixedAdjustmentReporting:jcCents(Number(old?.fixedAdjustment ?? 0)/exchangeRate)/100,
        resumeMonth:String(old?.resumeMonth ?? ''),postingMonth:old?.postingMonth ? String(old.postingMonth) : null,reason:String(old?.reason ?? ''),version:Number(old?.version ?? 0),confirmedAt:old?.confirmedAt ? String(old.confirmedAt) : null,confirmedBy:old?.confirmedBy ? String(old.confirmedBy) : null,
        status:old?.confirmedAt ? '已确认' : old?.approvedTotal != null ? '已退回' : '待核定',issue});
    }
  }
  return result;
}

async function details(component: Component) {
  const rows = await query<Row>(`SELECT DATE_FORMAT(month,'%Y-%m-%d') AS month,amount,source,registered,archived FROM ${MONTHS} WHERE componentId=:id ORDER BY month`, {id:component.id});
  const history: JcMonth[] = rows.filter((row) => Boolean(row.registered) || Boolean(row.archived)).map((row) => ({month:String(row.month),amount:Number(row.amount),source:String(row.source),locked:true}));
  const closed = await query<Row>(`SELECT DISTINCT DATE_FORMAT(archiveMonth,'%Y-%m-%d') AS month FROM internalservicefeesnapshots WHERE countryCode=:countryCode OR countryCode='' OR countryCode IS NULL ORDER BY month`, {countryCode:component.countryCode});
  const closedMonths = new Set(closed.map((row) => String(row.month)));
  const ended = component.endMonth < `${currentPeriodMonth()}-01`;
  const resumeMonth = ended ? contractMonth(component.endMonth,1) : component.resumeMonth || component.effectiveMonth;
  const projection = projectJcMonths({lifetimeTotal:(jcCents(component.ruleTotal)+jcCents(component.fixedAdjustment))/100,effectiveMonth:component.effectiveMonth,endMonth:component.endMonth,
    resumeMonth,postingMonth:component.postingMonth,lockedMonths:history,closedMonths});
  const months = projection.months.map((row) => ({
    ...row,
    reportingAmount: jcCents(row.amount / component.exchangeRate) / 100,
  }));
  const audit = await query<Row>(`SELECT id,action,actor,reason,approvedTotal,baselineRuleTotal,fixedAdjustment,DATE_FORMAT(createdAt,'%Y-%m-%d %H:%i:%s') AS createdAt FROM ${AUDIT} WHERE componentId=:id ORDER BY createdAt DESC,id`,{id:component.id});
  const revision = createHash('sha256').update(JSON.stringify([component,rows,closed,ended])).digest('hex');
  return {
    component:{
      ...component,
      registeredAmount:projection.registeredAmount,
      remainingAmount:projection.remainingAmount,
      unallocatedAmount:projection.unallocatedAmount,
      registeredAmountReporting:jcCents(projection.registeredAmount/component.exchangeRate)/100,
      remainingAmountReporting:jcCents(projection.remainingAmount/component.exchangeRate)/100,
      unallocatedAmountReporting:jcCents(projection.unallocatedAmount/component.exchangeRate)/100,
    },
    months,
    audit,
    revision,
    history,
    closedMonths,
  };
}

async function findComponent(id: string) {
  const [saved] = await query<Row>(`SELECT ledgerId FROM ${COMPONENTS} WHERE id=:id`,{id});
  const all = await candidates(saved ? String(saved.ledgerId) : undefined);
  const component = all.find((row) => row.id === id);
  if (!component) throw new Error('未找到对应的已确认JC调整明细，请刷新列表');
  return component;
}

export async function getJcDetail(id: string) {
  await requireSchema();
  const {component,months,audit,revision} = await details(await findComponent(id));
  return {component,months,audit,revision};
}

export async function listJcComponents(params: URLSearchParams) {
  await requireSchema();
  const keyword = (params.get('keyword') ?? '').trim().toLowerCase();
  const all = (await candidates()).filter((row) => !keyword || [row.batchName,row.deviceCode,row.ledgerId,row.adjustmentNo,row.countryCode].some((value) => value.toLowerCase().includes(keyword)));
  const pageSize = Math.min(100,Math.max(1,Number(params.get('pageSize')) || 20));
  const page = Math.min(Math.max(1,Math.floor(Number(params.get('page')) || 1)),Math.max(1,Math.ceil(all.length/pageSize)));
  const rows = await Promise.all(all.slice((page-1)*pageSize,page*pageSize).map(async (row) => (await details(row)).component));
  return {rows,total:all.length,page,pageSize};
}

type AdjustmentInput = {id:string;revision:string;approvedTotal?:unknown;approvedTotalReporting?:unknown;reason:string;resumeMonth:string;postingMonth?:string};
function amount(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === '' || !['string','number'].includes(typeof value)) throw new Error('金额不能为空，允许0或负数');
  const result = Number(value);
  if (!Number.isFinite(result) || Math.abs(result) > 1e12) throw new Error('金额不正确');
  return jcCents(result)/100;
}
function reason(value: string) { if (!value.trim()) throw new Error('请填写调整原因'); return value.trim(); }

async function prepareAdjustment(input: AdjustmentInput) {
  await requireSchema();
  const current = await details(await findComponent(input.id));
  if (input.revision !== current.revision) throw new Error('合同、历史登记或分摊数据已变化，请刷新后重新预览');
  if (current.component.confirmedAt) throw new Error('该JC管理费调整已确认，请先退回再修改');
  if (current.component.issue) throw new Error(String(current.component.issue));
  const approvedTotal = input.approvedTotalReporting != null
    ? jcCents(amount(input.approvedTotalReporting) * current.component.exchangeRate) / 100
    : amount(input.approvedTotal);
  const resumeMonth = parseJcMonth(input.resumeMonth);
  const postingMonth = input.postingMonth ? parseJcMonth(input.postingMonth) : null;
  if (!resumeMonth || (input.postingMonth && !postingMonth)) throw new Error('请填写有效的分摊起始月份或结清月份');
  const baselineRuleTotal = current.component.ruleTotal;
  const fixedAdjustment = (jcCents(approvedTotal)-jcCents(baselineRuleTotal))/100;
  const approvedTotalReporting = jcCents(approvedTotal / current.component.exchangeRate) / 100;
  const fixedAdjustmentReporting = jcCents(fixedAdjustment / current.component.exchangeRate) / 100;
  const component = {
    ...current.component,approvedTotal,approvedTotalReporting,baselineRuleTotal,fixedAdjustment,
    fixedAdjustmentReporting,resumeMonth,postingMonth,reason:reason(input.reason),
  };
  const ended = component.endMonth < `${currentPeriodMonth()}-01`;
  if (ended && !postingMonth && jcCents(approvedTotal) !== jcCents(current.component.registeredAmount)) throw new Error('合同已经到期，请明确选择开放月份一次性结清剩余差额');
  if (!ended && postingMonth) throw new Error('合同尚未到期，应按原合同剩余月份分摊');
  if (postingMonth && postingMonth <= component.endMonth) throw new Error('一次性结清月份应在原合同结束之后');
  if (postingMonth && (current.closedMonths.has(postingMonth) || current.history.some((row) => row.month === postingMonth))) throw new Error('一次性结清月份已登记或已对账，请选择开放月份');
  const projection = projectJcMonths({lifetimeTotal:approvedTotal,effectiveMonth:component.effectiveMonth,endMonth:component.endMonth,resumeMonth:ended?contractMonth(component.endMonth,1):resumeMonth,postingMonth,lockedMonths:current.history,closedMonths:current.closedMonths});
  if (postingMonth && projection.months.some((row) => !row.locked && row.month !== postingMonth)) throw new Error('合同仍有可分摊月份，请清空一次性结清月份');
  if (projection.unallocatedAmount !== 0) throw new Error('没有可分摊的开放月份，请为已到期合同选择一次性结清月份');
  return {current,component:{...component,registeredAmount:projection.registeredAmount,remainingAmount:projection.remainingAmount,unallocatedAmount:projection.unallocatedAmount},months:projection.months,revision:current.revision};
}

export async function previewJcAdjustment(input: AdjustmentInput) {
  const {component,months,revision} = await prepareAdjustment(input);
  return {component,months,revision};
}

async function persistComponent(component: Component) {
  await execute(`INSERT INTO ${COMPONENTS}
      (id,ledgerId,itemId,adjustmentNo,countryCode,batchName,deviceCode,currency,reportingCurrency,exchangeRate,
       effectiveMonth,endMonth,ruleTotal,ruleTotalReporting)
    VALUES
      (:id,:ledgerId,:itemId,:adjustmentNo,:countryCode,:batchName,:deviceCode,:currency,:reportingCurrency,:exchangeRate,
       :effectiveMonth,:endMonth,:ruleTotal,:ruleTotalReporting)
    ON DUPLICATE KEY UPDATE
      reportingCurrency=VALUES(reportingCurrency),exchangeRate=VALUES(exchangeRate),
      ruleTotal=VALUES(ruleTotal),ruleTotalReporting=VALUES(ruleTotalReporting)`,component);
}

async function ensureEnrollment(ledgerId: string) {
  const existing = await query<Row>(`SELECT id FROM ${COMPONENTS} WHERE ledgerId=:ledgerId LIMIT 1`,{ledgerId});
  if (!existing.length) {
    const frozen = await query<Row>(`SELECT id FROM monthlyinternalservicefees WHERE ledgerId=:ledgerId AND (archived=1 OR sourceType='manual') LIMIT 1`,{ledgerId});
    if (frozen.length) throw new Error('该合同已有旧版管理费对账或人工登记，请先核对原实例与JC历史拆分，避免重复计费');
  }
  for (const row of await candidates(ledgerId)) {
    if (row.issue) throw new Error(String(row.issue));
    await persistComponent(row);
  }
}

export async function confirmJcAdjustment(input: AdjustmentInput, actor: string) {
  return withInternalFeeTransaction(async () => {
    const prepared = await prepareAdjustment(input);
    await ensureEnrollment(prepared.component.ledgerId);
    const c = prepared.component;
    await execute(`UPDATE ${COMPONENTS} SET baselineRuleTotal=:baselineRuleTotal,approvedTotal=:approvedTotal,
      approvedTotalReporting=:approvedTotalReporting,fixedAdjustment=:fixedAdjustment,
      fixedAdjustmentReporting=:fixedAdjustmentReporting,
      resumeMonth=:resumeMonth,postingMonth=:postingMonth,reason=:reason,confirmedBy=:actor,
      confirmedAt=CURRENT_TIMESTAMP,version=version+1 WHERE id=:id`,{...c,actor});
    await writeAudit(c,'confirm',actor,prepared.current.component,c);
    const {regenerateInternalServiceLedger} = await import('./internal-service-fee-service');
    await regenerateInternalServiceLedger(c.ledgerId);
    return getJcDetail(c.id);
  });
}

export async function initializeJcAdjustments(
  ledgerId: string,
  actor: string,
  approvedReportingByItem: Record<string, number> = {},
) {
  await requireSchema();
  return withInternalFeeTransaction(async () => {
    await ensureEnrollment(ledgerId);
    const components = await candidates(ledgerId);
    const initialized: Array<{ id: string; adjustmentNo: string; approvedTotalReporting: number }> = [];
    for (const component of components) {
      const current = await details(component);
      const approvedTotalReporting = approvedReportingByItem[component.itemId]
        ?? approvedReportingByItem[component.adjustmentNo]
        ?? current.component.ruleTotalReporting;
      try {
        await confirmJcAdjustment({
          id: component.id,
          revision: current.revision,
          approvedTotalReporting,
          reason: '系统按新规则重新初始化',
          resumeMonth: component.effectiveMonth,
        }, actor);
      } catch (error) {
        throw new Error(
          `初始化 JC ${component.adjustmentNo}/${component.itemId} 失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }
      initialized.push({ id: component.id, adjustmentNo: component.adjustmentNo, approvedTotalReporting });
    }
    return initialized;
  });
}

export async function rollbackJcAdjustment(input:{id:string;revision:string;reason:string},actor:string) {
  await requireSchema();
  return withInternalFeeTransaction(async () => {
    const current = await details(await findComponent(input.id));
    if (input.revision !== current.revision) throw new Error('合同、历史登记或分摊数据已变化，请刷新后再退回');
    if (!current.component.confirmedAt) throw new Error('该JC管理费调整尚未确认或已经退回');
    const note = reason(input.reason);
    // Preserve the proposed total and months for editing. Only its confirmed
    // historical difference stops applying; registered/archived months stay locked.
    await execute(`UPDATE ${COMPONENTS} SET baselineRuleTotal=NULL,fixedAdjustment=0,fixedAdjustmentReporting=0,
      confirmedAt=NULL,confirmedBy=NULL,version=version+1 WHERE id=:id`,{id:input.id});
    const {regenerateInternalServiceLedger} = await import('./internal-service-fee-service');
    await regenerateInternalServiceLedger(current.component.ledgerId);
    const after = await getJcDetail(input.id);
    await writeAudit({...current.component,reason:note},'rollback',actor,current.component,after.component);
    return getJcDetail(input.id);
  });
}

async function writeAudit(c: Component, action: string, actor: string, before: unknown, after: unknown) {
  await execute(`INSERT INTO ${AUDIT} (id,componentId,action,actor,reason,approvedTotal,baselineRuleTotal,fixedAdjustment,beforeState,afterState)
    VALUES (:auditId,:id,:action,:actor,:reason,:approvedTotal,:baselineRuleTotal,:fixedAdjustment,:before,:after)`,{...c,auditId:randomUUID(),action,actor,before:JSON.stringify(before),after:JSON.stringify(after)});
}

export async function registerJcHistory(input:{id:string;revision:string;month:string;amount:unknown;reason:string},actor:string) {
  await requireSchema();
  return withInternalFeeTransaction(async () => {
    const current = await details(await findComponent(input.id));
    if (input.revision !== current.revision) throw new Error('历史数据已变化，请刷新后重试');
    const month = parseJcMonth(input.month);
    const c = current.component;
    if (!month || month < c.effectiveMonth || month > c.endMonth) throw new Error('历史登记月份应在JC生效至原合同结束之间');
    if (current.closedMonths.has(month) || current.history.some((row) => row.month === month)) throw new Error('该月份已登记或已对账，请通过后续开放月份调整');
    const value = amount(input.amount);
    const note = reason(input.reason);
    await ensureEnrollment(c.ledgerId);
    await execute(`INSERT INTO ${MONTHS}
        (componentId,month,amount,reportingAmount,source,registered,reason,registeredBy)
      VALUES
        (:id,:month,:amount,:reportingAmount,'history',1,:reason,:actor)
      ON DUPLICATE KEY UPDATE
        amount=VALUES(amount),reportingAmount=VALUES(reportingAmount),source='history',
        registered=1,reason=VALUES(reason),registeredBy=VALUES(registeredBy)`,{
          id:c.id,month,amount:value,reportingAmount:jcCents(value/c.exchangeRate)/100,reason:note,actor,
        });
    await execute(`UPDATE ${COMPONENTS} SET version=version+1 WHERE id=:id`,{id:c.id});
    await writeAudit({...c,reason:note},'history',actor,current.months.find((row) => row.month === month) ?? null,{month,amount:value});
    const {regenerateInternalServiceLedger} = await import('./internal-service-fee-service');
    await regenerateInternalServiceLedger(c.ledgerId);
    return getJcDetail(c.id);
  });
}

export async function hasJcEnrollment(ledgerId:string) {
  if (!await jcSchemaAvailable()) return false;
  return (await query<Row>(`SELECT id FROM ${COMPONENTS} WHERE ledgerId=:ledgerId LIMIT 1`,{ledgerId})).length > 0;
}

// Called inside the existing regeneration transaction. JC rows use a separate
// component ledger identity, preserving the existing (ledger,month) unique key.
export async function regenerateJcComponents(ledgerId:string, ledger:Row) {
  if (!await hasJcEnrollment(ledgerId)) return;
  for (const candidate of await candidates(ledgerId)) {
    if (candidate.issue) throw new Error(String(candidate.issue));
    await persistComponent(candidate);
    const detail = await details(candidate);
    await execute(`DELETE FROM ${MONTHS} WHERE componentId=:id AND registered=0 AND archived=0`,{id:candidate.id});
    await execute('DELETE FROM monthlyinternalservicefees WHERE ledgerId=:id AND archived=0',{id:candidate.id});
    for (const row of detail.months) {
      if (!row.locked) await execute(`INSERT INTO ${MONTHS} (componentId,month,amount,reportingAmount,source) VALUES (:id,:month,:amount,:reportingAmount,:source)`,{id:candidate.id,...row});
      const start = String(ledger.startMonth).slice(0,7).split('-').map(Number);
      const month = row.month.slice(0,7).split('-').map(Number);
      await execute(`INSERT INTO monthlyinternalservicefees
        (id,ledgerId,writeOffMonth,monthIndex,countryCode,batchName,requestNo,poNo,deviceCode,modelCode,nameEn,supplierId,undertakingUnitId,customerId,quantity,currency,
         internalServiceFeeAmount,reportingCurrency,exchangeRate,internalServiceFeeReportingAmount,sourceType,adjustmentNo,archived)
        VALUES
        (:rowId,:id,:month,:monthIndex,:countryCode,:batchName,:requestNo,:poNo,:deviceCode,:modelCode,:nameEn,:supplierId,:undertakingUnitId,:customerId,:quantity,:currency,
         :amount,:reportingCurrency,:exchangeRate,:reportingAmount,:sourceType,:adjustmentNo,0)
        ON DUPLICATE KEY UPDATE
          internalServiceFeeAmount=IF(archived,internalServiceFeeAmount,VALUES(internalServiceFeeAmount)),
          reportingCurrency=IF(archived,reportingCurrency,VALUES(reportingCurrency)),
          exchangeRate=IF(archived,exchangeRate,VALUES(exchangeRate)),
          internalServiceFeeReportingAmount=IF(archived,internalServiceFeeReportingAmount,VALUES(internalServiceFeeReportingAmount))`,{
          ...ledger,...candidate,...row,rowId:`${candidate.id}-${row.month.slice(0,7)}`,batchName:`${candidate.batchName}JC`,monthIndex:(month[0]-start[0])*12+month[1]-start[1]+1,sourceType:row.locked?'jc_history':'jc',
        });
    }
  }
}

export async function freezeJcMonth(month:string,countryCode:string,snapshotNo:string) {
  if (!await jcSchemaAvailable()) return;
  await execute(`UPDATE ${MONTHS} m JOIN ${COMPONENTS} c ON c.id=m.componentId SET m.archived=1,m.snapshotNo=:snapshotNo
    WHERE m.month=:month AND m.archived=0 ${countryCode?'AND c.countryCode=:countryCode':''}`,{month,countryCode,snapshotNo});
}

export async function assertJcReadyToArchive(countryCode:string) {
  if (!await jcSchemaAvailable()) return;
  const saved = await query<Row>(`SELECT id FROM ${COMPONENTS} ${countryCode?'WHERE countryCode=:countryCode':''}`,{countryCode});
  const ids = new Set(saved.map(row=>String(row.id)));
  for (const candidate of await candidates()) {
    if (countryCode && candidate.countryCode !== countryCode) continue;
    if (!ids.has(candidate.id)) throw new Error(`JC ${candidate.adjustmentNo} 尚未核定，请先完成管理费 JC 初始化后再生成对账单`);
    if (!candidate.confirmedAt && candidate.approvedTotal != null) throw new Error(`JC ${candidate.adjustmentNo} 已退回，请重新确认管理费调整后再生成对账单`);
    const detail = await details(candidate);
    if (detail.component.unallocatedAmount !== 0) throw new Error(`JC ${candidate.adjustmentNo} 尚有 ${detail.component.unallocatedAmount} ${candidate.currency} 未分配，请先选择开放结清月份再生成对账单`);
  }
}

export async function assertJcSourceMutable(input:{ledgerId?:string;adjustmentNo?:string}) {
  if (!await jcSchemaAvailable()) return;
  const rows = await query<Row>(`SELECT id FROM ${COMPONENTS} WHERE ${input.ledgerId?'ledgerId=:ledgerId':'adjustmentNo=:adjustmentNo'} LIMIT 1`,input);
  if (rows.length) throw new Error('该合同已有独立JC管理费记录，不能删除、换合同或退回原调整单；请新增调整单保留历史链路');
}

export async function jcSourceLedgerId(id:string) {
  if (!await jcSchemaAvailable()) return null;
  const [row] = await query<Row>(`SELECT ledgerId FROM ${COMPONENTS} WHERE id=:id`,{id});
  return row ? String(row.ledgerId) : null;
}
