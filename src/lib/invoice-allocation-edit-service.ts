import { createHash } from "node:crypto";
import { queryRowsRaw, queryRowsInTransaction, executeInTransaction, withTransaction, type Row } from "./db";
import { readInvoiceAllocationPlan, suggestInvoiceAllocations, type InvoiceAllocationPlan, type AllocationSourceType } from "./invoice-allocation";
import { loadAllocationSources, lockInvoiceAllocationSources, prepareInvoiceAllocationPlan, writeInvoiceAllocations } from "./invoice-allocation-service";
import { attachInvoiceFileToSource, backfillInvoiceSourceFields, type InvoiceActor } from "./invoice-service";
import { refreshStatementInvoiceSummary, removeStatementInvoiceAttachment, statementInvoiceEntries } from "./statement-invoice-ledger";
const text = (value: unknown) => String(value ?? "").trim();
const sqlDate=(value:unknown)=>value instanceof Date?`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`:text(value).slice(0,10);
const revision = (invoice:Row,allocations:Row[]) => createHash("sha256").update(JSON.stringify([invoice.id,invoice.updatedAt,invoice.allocationPlanJson,allocations])).digest("hex");
const allocationSql="SELECT sourceType,sourceId,sourceNo,period,currency,amountExcludingTax,taxRate,taxAmount,amountIncludingTax FROM merge_common_invoice_allocations WHERE invoiceId=:id ORDER BY sourceId";

export async function readInvoiceAllocationEdit(id:string) {
  const [invoice]=await queryRowsRaw<Row>("SELECT * FROM merge_common_invoices WHERE id=:id",{id});
  if(!invoice||invoice.status!=="issued") throw new Error("有效发票不存在");
  if(!["cloud_row","service_fee"].includes(text(invoice.sourceType))) throw new Error("该发票不支持账期分摊");
  const allocations=await queryRowsRaw<Row>(allocationSql,{id});
  const ids=[...new Set([text(invoice.sourceId),...allocations.map(row=>text(row.sourceId))])].filter(Boolean);
  const sources=await loadAllocationSources(invoice.sourceType as AllocationSourceType,ids);
  let plan=readInvoiceAllocationPlan(invoice.allocationPlanJson);
  if(!plan) {
    plan=suggestInvoiceAllocations(sources,text(invoice.currency));
    plan.allocations=plan.allocations.map(row=>{
      const previous=allocations.find(item=>item.sourceId===row.sourceId) || (ids.length===1 ? invoice : {});
      return {...row,exchangeRate:row.sourceCurrency===plan!.currency?"1":row.sourceCurrency==="USD"?text(invoice.exchangeRate):"",
        amountExcludingTax:text(previous.amountExcludingTax)||row.amountExcludingTax,taxRate:text(previous.taxRate)||row.taxRate,
        taxAmount:text(previous.taxAmount)||row.taxAmount,amountIncludingTax:text(previous.amountIncludingTax)||row.amountIncludingTax};
    });
  }
  return {invoice:{id:invoice.id,source:invoice.source,sourceType:invoice.sourceType,sourceId:invoice.sourceId,invoiceNo:invoice.invoiceNo,
    customerId:invoice.customerId,undertakingUnitId:invoice.undertakingUnitId,currency:invoice.currency,invoiceDate:invoice.invoiceDate,
    amountExcludingTax:invoice.amountExcludingTax,taxRate:invoice.taxRate,taxAmount:invoice.taxAmount,amountIncludingTax:invoice.amountIncludingTax},plan,revision:revision(invoice,allocations)};
}

export async function replaceInvoiceAllocations(id:string,raw:InvoiceAllocationPlan,expectedRevision:string,actor:InvoiceActor={}) {
  const [invoice]=await queryRowsRaw<Row>("SELECT * FROM merge_common_invoices WHERE id=:id",{id});
  if(!invoice||invoice.status!=="issued"||invoice.source!=="external") throw new Error("仅支持调整已登记的外部发票；本地生成的发票需先核对票面");
  if(raw.sourceType!==invoice.sourceType||raw.currency!==invoice.currency) throw new Error("不能通过分摊修改原发票的来源类型或币种");
  if(!raw.allocations.some(row=>row.sourceId===invoice.sourceId)) throw new Error("请保留原始关联账单，其他账期可增加或调整");
  const plan=await prepareInvoiceAllocationPlan(raw,{amountExcludingTax:invoice.amountExcludingTax,taxAmount:invoice.taxAmount,amountIncludingTax:invoice.amountIncludingTax},
    {invoiceId:id,instanceCode:text(invoice.approvalInstanceCode)});
  let before:Row[]=[];
  await withTransaction(async connection=>{
    const [locked]=await queryRowsInTransaction<Row>(connection,"SELECT * FROM merge_common_invoices WHERE id=:id FOR UPDATE",{id});
    before=await queryRowsInTransaction<Row>(connection,allocationSql,{id});
    if(!locked||locked.status!=="issued"||!expectedRevision||revision(locked,before)!==expectedRevision) throw new Error("发票分摊已变化，请重新打开后核对");
    await lockInvoiceAllocationSources(connection,plan,{invoiceId:id,instanceCode:text(invoice.approvalInstanceCode)});
    {
      const others = await statementInvoiceEntries(plan.sourceType, plan.allocations.map(row => row.sourceId), connection);
      if (others.some(row => row.id !== id && row.currency !== plan.currency)) throw new Error("该账期已有其他币种的发票，不能直接累加");
    }
    const retained=new Set(plan.allocations.map(row=>row.sourceId));
    for(const old of before.filter(row=>!retained.has(text(row.sourceId)))) {
      await removeStatementInvoiceAttachment(plan.sourceType, invoice, text(old.sourceId), connection);
    }
    await executeInTransaction(connection,"DELETE FROM merge_common_invoice_allocations WHERE invoiceId=:id",{id});
    await writeInvoiceAllocations(connection,id,plan);
    for (const old of before.filter(row => !retained.has(text(row.sourceId)))) {
      await refreshStatementInvoiceSummary(plan.sourceType, text(old.sourceId), connection);
    }
    for(const row of plan.allocations) {
      await backfillInvoiceSourceFields({invoiceId:id,sourceType:plan.sourceType,sourceId:row.sourceId,invoiceNo:text(invoice.invoiceNo),currency:plan.currency,
        amountExcludingTax:row.amountExcludingTax,taxAmount:row.taxAmount,taxRate:row.taxRate,amountIncludingTax:row.amountIncludingTax,
        exchangeRate:row.sourceCurrency==="USD"?row.exchangeRate:row.invoiceUsdRate||null,invoiceDate:sqlDate(invoice.invoiceDate),dueDate:sqlDate(invoice.dueDate),customerId:text(invoice.customerId),undertakingUnitId:text(invoice.undertakingUnitId)},connection);
      await attachInvoiceFileToSource({invoiceId:id,sourceType:plan.sourceType,sourceId:row.sourceId,actor,fileName:text(invoice.fileName),fileType:text(invoice.fileType),fileSize:Number(invoice.fileSize),provider:text(invoice.fileProvider),storageKey:text(invoice.storageKey)||null,dataUrl:text(invoice.fileContent)||null},connection);
    }
    await executeInTransaction(connection,"UPDATE merge_common_invoices SET updatedByUserId=:actorId,updatedByName=:actorName,updatedAt=NOW() WHERE id=:id",{id,actorId:actor.userId||null,actorName:actor.name||null});
  });
  return {id,invoiceNo:invoice.invoiceNo,before,plan};
}
