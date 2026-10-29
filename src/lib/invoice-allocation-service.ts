import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { queryRowsRaw, queryRowsInTransaction, executeInTransaction, type Row } from "./db";
import { buildExchangeRateMap, lookupExchangeRate } from "./exchange-rate-service";
import { allocationTotals, validateInvoiceAllocationPlan, type AllocationSourceType, type AllocationTotals, type InvoiceAllocationPlan, type InvoiceAllocationSource } from "./invoice-allocation";

const text = (value: unknown) => String(value ?? "").trim();
const money = (value: unknown) => Number(value ?? 0).toFixed(2);
const percent = (value: unknown) => String(Number(value || 0) * 100);
export const allocationSourceTables = { cloud_row: ["merge_cloud_rows", "id"], service_fee: ["merge_power_servicefeesnapshots", "snapshotNo"] } as const;

export async function loadAllocationSources(sourceType: AllocationSourceType, ids?: string[], connection?: PoolConnection): Promise<InvoiceAllocationSource[]> {
  if (!allocationSourceTables[sourceType]) throw new Error("该来源暂不支持多账期分摊");
  const query = <T extends Row>(sql: string, values: Row = {}) => connection ? queryRowsInTransaction<T>(connection, sql, values) : queryRowsRaw<T>(sql, values);
  const filter = (ids?.length ? ` WHERE r.${allocationSourceTables[sourceType][1]} IN (:ids)` : "") + (connection?" FOR UPDATE":"");
  const rows = sourceType === "cloud_row" ? await query<Row>(`SELECT r.*, COALESCE(c.customerId,r.customerId) AS businessCustomerId, COALESCE(c.shortName,c.name,r.customer) AS customerLabel
    FROM merge_cloud_rows r LEFT JOIN merge_common_customers c ON c.customerId=r.customerId OR c.customerCode=r.customerId${filter}`, { ids })
    : await query<Row>(`SELECT r.*, COALESCE(c.customerId,k.defaultCustomerId) AS businessCustomerId, COALESCE(c.shortName,c.name,r.countryCode) AS customerLabel,
        k.defaultUndertakingUnitId
      FROM merge_power_servicefeesnapshots r LEFT JOIN merge_power_countries k ON k.code=r.countryCode
      LEFT JOIN merge_common_customers c ON c.customerId=k.defaultCustomerId OR c.customerCode=k.defaultCustomerId${filter}`, { ids });
  return rows.map(row => {
    const cloud = sourceType === "cloud_row";
    const net = cloud ? row.customerReceivableNetAmount ?? row.customerReceivable ?? 0 : row.serviceFeeTotalExcludingTax ?? row.serviceFeeTotal ?? 0;
    const total = cloud ? row.customerReceivableTotalAmount ?? row.customerReceivable ?? 0 : row.serviceFeeTotal ?? 0;
    const period = cloud ? text(row.period) : (row.writeOffMonth instanceof Date ? `${row.writeOffMonth.getFullYear()}${String(row.writeOffMonth.getMonth()+1).padStart(2,"0")}` : text(row.writeOffMonth).replace(/[^0-9]/g, "").slice(0,6));
    return { sourceType, sourceId: text(cloud ? row.id : row.snapshotNo), sourceNo: cloud ? `${period} · ${text(row.account)}` : text(row.snapshotNo), period,
      customerId: text(row.businessCustomerId), customerName: text(row.customerLabel), undertakingUnitId: text(cloud ? row.undertakingUnitId : row.defaultUndertakingUnitId), account: text(cloud ? row.account : row.countryCode),
      sourceCurrency: cloud ? "USD" : text(row.serviceFeeCurrency).toUpperCase() || "USD", sourceNet: money(net), sourceTax: money(Number(total)-Number(net)), sourceTotal: money(total), sourceTaxRate: percent(cloud ? row.customerTaxRate : row.vatRate),
      disabledReason: text(row.invoiceNo) ? `已登记发票 ${text(row.invoiceNo)}` : ["issued", "已开票"].includes(text(cloud ? row.collectionInvoice : row.invoiceStatus)) ? "已标记开票，请先核对原登记" : Number(total) <= 0 ? "账单应收金额不大于零" : "" };
  }).sort((a,b) => a.period.localeCompare(b.period) || a.sourceId.localeCompare(b.sourceId));
}

async function occupancy(sourceType: AllocationSourceType, ids: string[], options: { invoiceId?: string; instanceCode?: string } = {}, connection?: PoolConnection) {
  const query = <T extends Row>(sql: string, values: Row = {}) => connection ? queryRowsInTransaction<T>(connection, sql, values) : queryRowsRaw<T>(sql, values);
  if (!ids.length) return { blocked: new Map<string,string>(), owned: new Set<string>() };
  const invoices = await query<Row>(`SELECT i.id,i.invoiceNo,i.sourceId AS primarySourceId,a.sourceId AS allocationSourceId
    FROM merge_common_invoices i LEFT JOIN merge_common_invoice_allocations a ON a.invoiceId=i.id
    WHERE i.status='issued' AND i.sourceType=:type AND (i.sourceId IN (:ids) OR a.sourceId IN (:ids))${connection?" FOR UPDATE":""}`, { type: sourceType, ids });
  const approvals = await query<Row>(`SELECT instanceCode,ownerId,allocationSourceIds,serialNumber FROM merge_common_feishu_approvals
    WHERE ownerType=:type AND status IN ('pending','returned','approved') AND (ownerId IN (:ids) OR allocationSourceIds IS NOT NULL)${connection?" FOR UPDATE":""}`, { type: sourceType, ids });
  const blocked = new Map<string,string>(), owned = new Set<string>();
  for (const row of invoices) for (const id of [text(row.primarySourceId),text(row.allocationSourceId)].filter(id=>ids.includes(id))) {
    if (text(row.id) === options.invoiceId) owned.add(id); else blocked.set(id, `已关联发票 ${text(row.invoiceNo)}`);
  }
  for (const row of approvals) {
    if (text(row.instanceCode) === options.instanceCode) continue;
    for (const id of [text(row.ownerId), ...text(row.allocationSourceIds).split(",")].filter(id=>ids.includes(id))) blocked.set(id, `已有生效审批 ${text(row.serialNumber)||text(row.instanceCode)}`);
  }
  return { blocked, owned };
}

export async function listAllocationCandidates(params: { sourceType: AllocationSourceType; sourceId: string; currency?: string; from?: string; to?: string; invoiceId?: string }) {
  const rows = await loadAllocationSources(params.sourceType);
  const initial = rows.find(row=>row.sourceId===params.sourceId);
  if (!initial) throw new Error("来源账单不存在");
  if (!initial.customerId) throw new Error("请先设置该账单的业务客户或国家默认客户");
  const candidates = rows.filter(row=>row.customerId===initial.customerId && (!params.from||row.period>=params.from) && (!params.to||row.period<=params.to));
  const [invoice] = params.invoiceId ? await queryRowsRaw<Row>("SELECT id,approvalInstanceCode FROM merge_common_invoices WHERE id=:id AND status='issued'", {id:params.invoiceId}) : [];
  const state = await occupancy(params.sourceType,candidates.map(row=>row.sourceId), {invoiceId:params.invoiceId,instanceCode:text(invoice?.approvalInstanceCode)});
  const rates = await buildExchangeRateMap(candidates.map(row=>row.period));
  const target = params.currency?.toUpperCase() || initial.sourceCurrency;
  return { rows: candidates.map(row=>({...row, suggestedRate:String(lookupExchangeRate(rates,row.period,row.sourceCurrency,target)??""), invoiceUsdRate:String(lookupExchangeRate(rates,row.period,"USD",target)??""), disabledReason:state.blocked.get(row.sourceId)||(state.owned.has(row.sourceId)?"":row.disabledReason)})), customerId: initial.customerId };
}

export async function prepareInvoiceAllocationPlan(raw: InvoiceAllocationPlan, expected: AllocationTotals, options: { invoiceId?: string; instanceCode?: string; snapshot?: InvoiceAllocationPlan | null } = {}): Promise<InvoiceAllocationPlan> {
  const error = validateInvoiceAllocationPlan(raw, expected);
  if (error) throw new Error(error);
  const ids = raw.allocations.map(row=>row.sourceId);
  const sources = await loadAllocationSources(raw.sourceType,ids);
  if (sources.length!==ids.length) throw new Error("所选账单已不存在，请刷新核对");
  if (new Set(sources.map(row=>row.customerId)).size !== 1 || !sources[0]?.customerId) throw new Error("请选择同一业务客户的账单，实际开票客户可单独选择");
  const state = await occupancy(raw.sourceType,ids,options);
  const allocations = sources.map(source=>{
    const input = raw.allocations.find(row=>row.sourceId===source.sourceId)!;
    const blocked = state.blocked.get(source.sourceId) || (!state.owned.has(source.sourceId) ? source.disabledReason : "");
    if (blocked) throw new Error(`${source.period}：${blocked}`);
    const snapshot = options.snapshot?.allocations.find(row=>row.sourceId===source.sourceId);
    const reference = snapshot || source;
    return { ...reference, disabledReason: "", exchangeRate: String(input.exchangeRate), taxRate:String(input.taxRate),
      amountExcludingTax:String(input.amountExcludingTax), taxAmount:String(input.taxAmount), amountIncludingTax:String(input.amountIncludingTax) };
  });
  const plan: InvoiceAllocationPlan = {...raw, allocations, description:raw.description.trim()};
  const invalid = validateInvoiceAllocationPlan(plan,expected);
  if (invalid) throw new Error(invalid);
  return plan;
}

/** Lock source rows in deterministic order and recheck occupancy within the save transaction. */
export async function lockInvoiceAllocationSources(connection:PoolConnection,plan:InvoiceAllocationPlan,options:{invoiceId?:string;instanceCode?:string}={}) {
  const [table,key]=allocationSourceTables[plan.sourceType];
  for (const id of plan.allocations.map(row=>row.sourceId).sort()) {
    const [row]=await queryRowsInTransaction<Row>(connection,`SELECT ${key},invoiceNo FROM ${table} WHERE ${key}=:id FOR UPDATE`,{id});
    if(!row) throw new Error("关联账单已删除，请刷新");
  }
  const state=await occupancy(plan.sourceType,plan.allocations.map(row=>row.sourceId),options,connection);
  if(state.blocked.size) throw new Error([...state.blocked.values()][0]);
  const current=await loadAllocationSources(plan.sourceType,plan.allocations.map(row=>row.sourceId),connection);
  for(const row of current) {
    if(row.disabledReason&&!state.owned.has(row.sourceId)) throw new Error(`${row.period}：${row.disabledReason}`);
    if(!options.instanceCode) {
      const old=plan.allocations.find(item=>item.sourceId===row.sourceId)!;
      if(old.sourceNet!==row.sourceNet||old.sourceTotal!==row.sourceTotal||old.sourceCurrency!==row.sourceCurrency||old.customerId!==row.customerId) throw new Error("账单金额或客户已变化，请刷新分摊方案");
    }
  }
}

export async function writeInvoiceAllocations(connection:PoolConnection,invoiceId:string,plan:InvoiceAllocationPlan) {
  for(const row of plan.allocations) await executeInTransaction(connection,`INSERT INTO merge_common_invoice_allocations
    (id,invoiceId,sourceType,sourceId,sourceNo,period,currency,amountExcludingTax,taxRate,taxAmount,amountIncludingTax)
    VALUES (:id,:invoiceId,:sourceType,:sourceId,:sourceNo,:period,:currency,:amountExcludingTax,:taxRate,:taxAmount,:amountIncludingTax)`,
    {id:randomUUID(),invoiceId,...row,currency:plan.currency});
  await executeInTransaction(connection,"UPDATE merge_common_invoices SET allocationPlanJson=:plan WHERE id=:id",{id:invoiceId,plan:JSON.stringify(plan)});
}

/** A finance-readable attachment preserves years, requested line layout and allocation amounts. */
export async function invoiceAllocationAttachment(plan:InvoiceAllocationPlan) {
  const ExcelJS=(await import("exceljs")).default;
  const workbook=new ExcelJS.Workbook(); const sheet=workbook.addWorksheet("合并开票说明");
  sheet.addRow(["票面展示",plan.lineMode==="summary"?"合并为一行":"按账期分行"]);
  sheet.addRow(["票面描述",plan.description]); sheet.addRow(["开票币种",plan.currency]);
  sheet.addRow(["账期","账单/账号","账单币种","账单含税","汇率（原币→开票币）","开票未税","税率%","税金","开票含税"]);
  for(const row of plan.allocations) sheet.addRow([row.period,row.sourceNo,row.sourceCurrency,Number(row.sourceTotal),Number(row.exchangeRate),Number(row.amountExcludingTax),Number(row.taxRate),Number(row.taxAmount),Number(row.amountIncludingTax)]);
  const totals=allocationTotals(plan.allocations); sheet.addRow(["合计","","","","",Number(totals.amountExcludingTax),"",Number(totals.taxAmount),Number(totals.amountIncludingTax)]);
  sheet.columns.forEach(column=>{column.width=24;}); sheet.getColumn(2).width=48;
  sheet.getRow(4).font={bold:true};
  return {fileName:"合并开票说明.xlsx",bytes:Buffer.from(await workbook.xlsx.writeBuffer())};
}
