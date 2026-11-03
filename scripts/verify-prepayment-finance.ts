import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  assert.ok(process.argv.includes("--allow-write-test"), "隔离库验证需要 --allow-write-test");
  assert.ok(["127.0.0.1","localhost"].includes(process.env.DB_HOST || ""), "只能在本机隔离数据库执行");
  assert.match(process.env.DB_NAME || "", /(?:test|local)/i, "数据库名必须包含 test 或 local");
  process.env.OBS_ENABLED="0";
  const db = await import("../src/lib/db");
  const finance = await import("../src/lib/prepayment-finance-service");
  const invoices = await import("../src/lib/invoice-service");
  const math = await import("../src/lib/prepayment-finance");
  const id=randomUUID(), otherId=randomUUID(), code=`TEST-PPF-${id.slice(0,8)}`, otherCode=code+"-2";
  const checks:string[]=[];
  const [customer]=await db.queryRowsRaw("SELECT customerId FROM merge_common_customers WHERE name IS NOT NULL LIMIT 1");
  const [unit]=await db.queryRowsRaw("SELECT undertakingUnitId FROM merge_common_undertaking_units WHERE nameEn IS NOT NULL LIMIT 1");
  assert.ok(customer && unit);
  const parties={customerId:String(customer.customerId),undertakingUnitId:String(unit.undertakingUnitId)};
  try {
    for(const [key,no] of [[id,code],[otherId,otherCode]]) await db.executeRaw("INSERT INTO merge_power_prepaymentcontracts (contractNo,status,currency,effectiveDate,totalAmount,financeId) VALUES (:no,'已确认','CNY','2026-11-01',106000,:key)",{key,no});
    await assert.rejects(finance.prepaymentInvoicePrefill(id),/口径/);checks.push("历史未设税务口径不能误开票");
    for(const no of [code,otherCode]) await finance.savePrepaymentSettings(no,{basis:"gross",taxRate:6,...parties,version:0});
    const invoice=async(no:string,total:number,sourceId=id,currency="CNY",rate="1")=>invoices.saveInvoice({source:"external",manualRegistration:true,sourceType:"prepayment_contract",sourceId,sourceNo:code,invoiceNo:no,...parties,currency,businessExchangeRate:rate,invoiceDate:"2026-11-01",paymentTermDays:30,dueDate:"2026-12-01",...math.financialAmounts(total,6)});
    const first=await invoice(code+"-A",53000),second=await invoice(code+"-B",53000);
    assert.ok(first?.id && second?.id);
    let state=await finance.getPrepaymentFinance(code);assert.equal(state.summary.invoiced,106000);assert.equal(state.summary.received,0);checks.push("同合同两张发票累计且不产生虚假收款");
    await assert.rejects(invoice(code+"-A",53000),/已登记/);
    await assert.rejects(invoice(code+"-C",1),/超过/);checks.push("重复票号和超过剩余额度被阻止");
    const receipt=async(total:number,allocations:import("../src/lib/prepayment-finance").ReceiptAllocationInput[],requestKey=randomUUID())=>finance.savePrepaymentReceipt(code,{requestKey,...parties,currency:"CNY",businessExchangeRate:"1",...math.financialAmounts(total,6),receivedDate:"2026-11-03",isReceived:true,bankSerialNo:"SAME-SPLIT-BANK-REFERENCE",allocations},"isolated-test");
    const r1=await receipt(30000,[{invoiceId:String(first.id),amount:30000}]);
    const key=randomUUID(),r2=await receipt(23000,[{invoiceId:String(first.id),amount:23000}],key);
    assert.equal(await receipt(23000,[{invoiceId:String(first.id),amount:23000}],key),r2);
    const r3=await receipt(53000,[{invoiceId:String(second.id),amount:53000}]);
    state=await finance.getPrepaymentFinance(code);assert.equal(state.summary.received,106000);assert.equal(state.receipts.length,3);assert.equal(Number(state.invoices.find(i=>i.id===first.id)?.receivedAmount),53000);checks.push("多笔收款、同流水拆分、重试幂等、按发票余额累计");
    await assert.rejects(invoices.voidInvoice(String(first.id),"test"),/关联收款/);
    for(const receiptId of [r1,r2,r3])await finance.voidPrepaymentReceipt(code,String(receiptId),1,"test undo","isolated-test");
    state=await finance.getPrepaymentFinance(code);assert.equal(state.summary.received,0);
    const multi=await receipt(106000,[{invoiceId:String(first.id),amount:53000},{invoiceId:String(second.id),amount:53000}]);
    state=await finance.getPrepaymentFinance(code);assert.equal(state.summary.received,106000);assert.equal(state.invoices.filter(i=>Number(i.receivedAmount)===53000).length,2);checks.push("一笔收两票不重复累计合同实收");
    await finance.voidPrepaymentReceipt(code,String(multi),1,"test undo","isolated-test");
    await invoices.voidInvoice(String(first.id),"test undo");await invoices.voidInvoice(String(second.id),"test undo");
    state=await finance.getPrepaymentFinance(code);assert.equal(state.summary.invoiced,0);checks.push("作废票款回算，已关联收款的发票不能直接作废");
    const foreign=await invoice(code+"-USD",1000,id,"USD","7");
    await finance.savePrepaymentReceipt(code,{requestKey:randomUUID(),...parties,currency:"CNY",...math.financialAmounts(7000,6),receivedDate:"2026-11-03",isReceived:true,allocations:[{invoiceId:String(foreign!.id),amount:7000,invoiceExchangeRate:1/7}]},"isolated-test");
    state=await finance.getPrepaymentFinance(code);assert.equal(state.summary.invoiced,7000);assert.equal(state.summary.received,7000);assert.equal(Number(state.invoices.find(i=>i.id===foreign!.id)?.receivedAmount),1000);checks.push("异币发票折合同币汇总，异币收款按分配汇率核对票余额");
    const other=await invoice(otherCode+"-A",1000,otherId);
    await assert.rejects(receipt(1,[{invoiceId:String(other!.id),amount:1}]),/不属于/);checks.push("跨合同发票分配被拒绝");
    const advance=await receipt(3000,[]);state=await finance.getPrepaymentFinance(code);assert.equal(state.summary.received,10000);
    const edit=state.receipts.find(r=>r.id===advance)!;
    await assert.rejects(finance.savePrepaymentReceipt(code,{...edit,...parties,id:String(advance),requestKey:String(edit.requestKey),version:0,currency:"CNY",...math.financialAmounts(3000,6),isReceived:true,receivedDate:"2026-11-03",allocations:[]},"test"),/已更新/);checks.push("先收后开与收款编辑版本冲突保护");
    const request={currency:"CNY",amountIncludingTax:"99000",taxRate:"6",businessExchangeRate:"1"};
    const approvalId=code+"-approval";
    await db.withTransaction(async c=>{
      await finance.lockPrepaymentCapacity(c,id,request);
      await db.executeInTransaction(c,"INSERT INTO merge_common_feishu_approvals (id,ownerType,ownerId,ownerNo,approvalCode,instanceCode,status,businessRequestJson,starterOpenId) VALUES (:id,'prepayment_contract',:sourceId,:no,'test',:id,'pending',:json,'ou_test')",{id:approvalId,sourceId:id,no:code,json:JSON.stringify(request)});
    });
    state=await finance.getPrepaymentFinance(code);assert.equal(state.summary.reserved,99000);assert.equal(state.summary.remainingInvoice,0);
    await assert.rejects(invoice(code+"-reserve",1),/超过/);
    await db.executeRaw("UPDATE merge_common_feishu_approvals SET status='rejected' WHERE id=:id",{id:approvalId});
    state=await finance.getPrepaymentFinance(code);assert.equal(state.summary.remainingInvoice,99000);checks.push("未完成审批占用额度，拒绝后释放");
    const summaries=await finance.prepaymentFinanceSummaries([code,otherCode]);assert.equal(summaries.find(row=>row.contractNo===code)?.received,"10000.00");
    checks.push("列表汇总与详情一致");
    console.log(JSON.stringify({database:process.env.DB_NAME,passed:checks.length,checks},null,2));
  } finally {
    // Only rows tied to the two UUIDs generated by this test are removed.
    const sources={ids:[id,otherId]};
    await db.executeRaw("DELETE a FROM merge_common_receipt_allocations a JOIN merge_common_receipts r ON r.id=a.receiptId WHERE r.sourceType='prepayment_contract' AND r.sourceId IN (:ids)",sources);
    await db.executeRaw("DELETE FROM merge_common_receipts WHERE sourceType='prepayment_contract' AND sourceId IN (:ids)",sources);
    await db.executeRaw("DELETE t FROM merge_common_invoice_items t JOIN merge_common_invoices i ON i.id=t.invoiceId WHERE i.sourceType='prepayment_contract' AND i.sourceId IN (:ids)",sources);
    await db.executeRaw("DELETE FROM merge_common_invoice_business_links WHERE sourceType='prepayment_contract' AND sourceId IN (:ids)",sources);
    await db.executeRaw("DELETE FROM merge_common_invoices WHERE sourceType='prepayment_contract' AND sourceId IN (:ids)",sources);
    await db.executeRaw("DELETE FROM merge_common_feishu_approvals WHERE ownerType='prepayment_contract' AND ownerId IN (:ids)",sources);
    await db.executeRaw("DELETE FROM merge_power_prepaymentcontracts WHERE financeId IN (:ids)",sources);
    await db.closeDb();
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
