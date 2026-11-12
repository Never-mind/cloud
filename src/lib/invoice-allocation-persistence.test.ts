import {beforeEach,describe,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({query:vi.fn(),queryTx:vi.fn(),execute:vi.fn(),writes:[] as Array<{sql:string;values:Record<string,unknown>}>,committed:false,rolledBack:false}));
vi.mock("./db",()=>({queryRowsRaw:mock.query,queryRows:mock.query,executeRaw:mock.execute,
  queryRowsInTransaction:(_c:unknown,sql:string,values:Record<string,unknown>)=>mock.queryTx(sql,values),
  executeInTransaction:(_c:unknown,sql:string,values:Record<string,unknown>)=>mock.execute(sql,values),
  withTransaction:async(cb:(c:object)=>Promise<unknown>)=>{try{const result=await cb({});mock.committed=true;return result;}catch(error){mock.rolledBack=true;throw error;}}}));
vi.mock("./file-storage-service",()=>({storeFile:vi.fn(async(input:{fileName:string})=>({provider:"db",storageKey:null,fileName:input.fileName})),deleteFileObject:vi.fn(),readFile:vi.fn()}));
vi.mock("./invoice-pdf",()=>({renderInvoicePdf:vi.fn(async()=>Buffer.from("%PDF-1.7\nfixture"))}));
import {saveInvoice,voidInvoice} from "./invoice-service";
import {loadAllocationSources,prepareInvoiceAllocationPlan,lockInvoiceAllocationSources,invoiceAllocationAttachment} from "./invoice-allocation-service";
import {readInvoiceAllocationEdit,replaceInvoiceAllocations} from "./invoice-allocation-edit-service";
import {suggestInvoiceAllocations,allocationTotals,type InvoiceAllocationSource} from "./invoice-allocation";
import {applyInvoiceLineAmounts} from "./invoice-approval-allocation-amounts";
const periods=["202512","202601","202602","202603","202604","202605"];
const rows=periods.map((period,index)=>({id:`row${index}`,snapshotNo:`row${index}`,period,writeOffMonth:`${period.slice(0,4)}-${period.slice(4)}-01`,account:`account${index}`,customerId:"business-A",businessCustomerId:"business-A",customerLabel:"Customer A",undertakingUnitId:"business-unit",defaultUndertakingUnitId:"business-unit",customerReceivableNetAmount:"100",customerReceivableTotalAmount:"100",customerTaxRate:0,serviceFeeTotalExcludingTax:"100",serviceFeeTotal:"100",serviceFeeCurrency:"USD",vatRate:0}));
const sources:InvoiceAllocationSource[]=rows.map(row=>({sourceType:"cloud_row",sourceId:row.id,sourceNo:`${row.period} · ${row.account}`,period:row.period,customerId:"business-A",customerName:"Customer A",undertakingUnitId:"business-unit",account:row.account,sourceCurrency:"USD",sourceNet:"100.00",sourceTax:"0.00",sourceTotal:"100.00",sourceTaxRate:"0",suggestedRate:"7"}));
function plan(type:"cloud_row"|"service_fee"="cloud_row"){const result=suggestInvoiceAllocations(sources.map(row=>({...row,sourceType:type})),"CNY");result.lineMode="summary";result.summaryCompatible=true;return result;}
function query(sql:string,values:Record<string,unknown>={}){
  if (sql.includes("COALESCE(a.sourceId, i.sourceId)")) {
    const invoice = mock.writes.find(row => row.sql.includes("INSERT INTO merge_common_invoices"))?.values;
    if (!invoice) return [];
    return mock.writes.filter(row => row.sql.includes("INSERT INTO merge_common_invoice_allocations") && (values.ids as string[]).includes(String(row.values.sourceId)))
      .map(row => ({ ...invoice, ...row.values, id: invoice.id }));
  }
  if(sql.includes("FROM merge_cloud_rows")||sql.includes("FROM merge_power_servicefeesnapshots"))return rows.filter(row=>values.id?row.id===values.id:Array.isArray(values.ids)?values.ids.includes(row.id):true);
  if(sql.includes("FROM merge_common_customers WHERE"))return [{name:"Actual invoice buyer B"}];
  if(sql.includes("FROM merge_common_undertaking_units WHERE"))return [{name:"Invoice issuing unit"}];
  return [];
}
beforeEach(()=>{vi.resetAllMocks();mock.writes=[];mock.committed=false;mock.rolledBack=false;mock.query.mockImplementation(async(sql,values)=>query(sql,values));mock.queryTx.mockImplementation(async(sql,values)=>query(sql,values));mock.execute.mockImplementation(async(sql,values)=>{mock.writes.push({sql,values});});});
describe("multi-period persistence",()=>{
  it.each(["cloud_row","service_fee"] as const)("registers two approval returns with independent allocations and completes %s only after both files",async sourceType=>{
    const full=plan(sourceType);full.lineMode="period";
    full.allocations=full.allocations.slice(0,2).map((row,i)=>({...row,amountExcludingTax:i?"200.00":"100.00",taxAmount:"0.00",amountIncludingTax:i?"200.00":"100.00"}));
    const approval={instanceCode:"instance",status:"approved",invoiceId:null as string|null,ownerType:sourceType,ownerId:"row0",allocationSourceIds:"row0,row1",allocationPlanJson:JSON.stringify(full)};
    const files=full.allocations.flatMap((row,i)=>["pdf","xml"].map(ext=>({id:`file${i}.${ext}`,fileName:`F${i}.${ext}`,invoiceIdentity:`identity${i}`,invoiceNo:`F${i}`,invoiceId:null as string|null,recognitionJson:JSON.stringify({facts:{invoiceNo:`F${i}`,invoiceDate:"2026-06-01",currency:"CNY",amountExcludingTax:row.amountExcludingTax,taxAmount:"0.00",taxRate:"0",amountIncludingTax:row.amountIncludingTax},matches:{issuerUnitId:"invoice-unit",receiverCustomerId:"invoice-buyer-B"}})})));
    const respond=(sql:string,values:Record<string,unknown>)=>{
      if(sql.includes("FROM merge_common_feishu_approvals"))return [approval];
      if(sql.includes("FROM merge_common_invoice_approval_files"))return files.filter(file=>!values.id||file.id===values.id);
      if(sql.includes("i.approvalInstanceCode=:code"))return mock.writes.filter(w=>w.sql.includes("INSERT INTO merge_common_invoices")&&w.values.sourceId===values.sourceId).map(w=>({id:w.values.id}));
      if(sql.includes("COALESCE(a.sourceId, i.sourceId)"))return mock.writes.filter(w=>w.sql.includes("INSERT INTO merge_common_invoice_allocations")&&(values.ids as string[]).includes(String(w.values.sourceId))).map(w=>({...mock.writes.find(i=>i.sql.includes("INSERT INTO merge_common_invoices")&&i.values.id===w.values.invoiceId)?.values,...w.values,id:w.values.invoiceId}));
      return query(sql,values);
    };
    mock.query.mockImplementation(async(sql,values)=>respond(sql,values));mock.queryTx.mockImplementation(async(sql,values)=>respond(sql,values));
    mock.execute.mockImplementation(async(sql,values)=>{
      mock.writes.push({sql,values});
      if(sql.startsWith("UPDATE merge_common_invoice_approval_files"))for(const file of files)if(Object.entries(values).some(([key,id])=>key.startsWith("fileId")&&id===file.id))file.invoiceId=String(values.id);
      if(sql.startsWith("UPDATE merge_common_feishu_approvals SET invoiceId"))approval.invoiceId=values.id as string|null;
    });
    for(const [index,row] of full.allocations.entries()){
      const subset={...full,allocations:[row]};
      await saveInvoice({source:"external",sourceType,sourceId:row.sourceId,invoiceNo:`F${index}`,customerId:"invoice-buyer-B",undertakingUnitId:"invoice-unit",currency:"CNY",invoiceDate:"2026-06-01",paymentTermDays:30,dueDate:"2026-07-01",amountExcludingTax:row.amountExcludingTax,taxAmount:row.taxAmount,taxRate:row.taxRate,amountIncludingTax:row.amountIncludingTax,allocationPlan:subset,file:{fileName:`F${index}.pdf`,fileType:"application/pdf",bytes:Buffer.from("fixture")}}, {}, {instanceCode:"instance",fileId:`file${index}.pdf`,relatedFileIds:[`file${index}.pdf`,`file${index}.xml`],mode:"automatic",allocationMode:"matched_return"});
      if(index===0)expect(approval.invoiceId).toBeNull();
    }
    expect(mock.writes.filter(w=>w.sql.includes("INSERT INTO merge_common_invoices"))).toHaveLength(2);
    const allocations=mock.writes.filter(w=>w.sql.includes("INSERT INTO merge_common_invoice_allocations"));
    expect(allocations.map(w=>[w.values.sourceId,w.values.amountIncludingTax])).toEqual([["row0","100.00"],["row1","200.00"]]);
    expect(approval.invoiceId).toBeTruthy();expect(files.every(file=>file.invoiceId)).toBe(true);
    expect(files[0].invoiceId).toBe(files[1].invoiceId);expect(files[2].invoiceId).toBe(files[3].invoiceId);expect(files[0].invoiceId).not.toBe(files[2].invoiceId);
    const backfills=mock.writes.filter(w=>w.sql.includes(sourceType==="cloud_row"?"UPDATE merge_cloud_rows":"UPDATE merge_power_servicefeesnapshots"));
    expect(backfills.map(w=>w.values.total)).toEqual(["100.00","200.00"]);
  });
  it("registers two same-month accounts at confirmed MXN amounts without replacing them by FX products",async()=>{
    const localRows=rows.slice(0,2).map((row,i)=>({...row,period:"202610",customerReceivableNetAmount:i?"5125.47":"638.95",customerReceivableTotalAmount:i?"5125.47":"638.95",customerTaxRate:0.16}));
    const respond=(sql:string,values:Record<string,unknown>)=>sql.includes("FROM merge_cloud_rows")?localRows.filter(row=>values.id?row.id===values.id:Array.isArray(values.ids)?values.ids.includes(row.id):true):query(sql,values);
    mock.query.mockImplementation(async(sql,values)=>respond(sql,values));mock.queryTx.mockImplementation(async(sql,values)=>respond(sql,values));
    const loaded=await loadAllocationSources("cloud_row",localRows.map(row=>row.id));
    const allocationPlan=applyInvoiceLineAmounts(suggestInvoiceAllocations(loaded.map(row=>({...row,suggestedRate:"18.02"})),"MXN"),["11516.54","92376.13"].map((amountIncludingTax,i)=>({amountIncludingTax,invoiceContent:"Service",cfdiCodeKey:"G03",allocationSourceId:localRows[i].id})));
    await saveInvoice({source:"external",sourceType:"cloud_row",sourceId:"row0",invoiceNo:"MXN-CONFIRMED",customerId:"invoice-buyer-B",undertakingUnitId:"invoice-unit",currency:"MXN",invoiceDate:"2026-11-11",paymentTermDays:30,dueDate:"2026-12-11",...allocationTotals(allocationPlan.allocations) as {amountExcludingTax:string;taxAmount:string;amountIncludingTax:string;taxRate:string},allocationPlan,file:{fileName:"confirmed.pdf",fileType:"application/pdf",bytes:Buffer.from("fixture")}});
    expect(mock.committed).toBe(true);
    const allocations=mock.writes.filter(row=>row.sql.includes("INSERT INTO merge_common_invoice_allocations"));
    expect(allocations.map(row=>[row.values.sourceId,row.values.period,row.values.amountIncludingTax])).toEqual([["row0","202610","11516.54"],["row1","202610","92376.13"]]);
    const backfills=mock.writes.filter(row=>row.sql.includes("UPDATE merge_cloud_rows"));
    expect(backfills.map(row=>row.values.total)).toEqual(["11516.54","92376.13"]);
    expect(backfills.map(row=>row.sql).join("\n")).not.toMatch(/(?:SET|,)\s*customerReceivable\w*\s*=/);
  });
  it("keeps custom Feishu rows separate from six monthly allocations in the finance attachment",async()=>{
    const file=await invoiceAllocationAttachment(plan(),[
      {description:"Servicios relacionados con la Voice servicio",amount:"1000.01",cfdiCode:"G03 Gastos en general"},
      {description:"Servicios de soporte",amount:"3199.99",cfdiCode:"G03 Gastos en general"},
    ]);
    const ExcelJS=(await import("exceljs")).default;
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(file.bytes as never);
    const accounting=workbook.getWorksheet("合并开票说明")!;
    expect(accounting.getCell("B1").value).toBe("自定义 2 行（见开票明细页）");
    expect(periods.map((_,i)=>accounting.getCell(`A${i+5}`).value)).toEqual(periods);
    expect(periods.map((_,i)=>accounting.getCell(`I${i+5}`).value)).toEqual(periods.map(()=>700));
    const details=workbook.getWorksheet("开票明细")!;
    expect(details.rowCount).toBe(4);
    expect(details.getRow(2).values).toEqual([undefined,1,"Servicios relacionados con la Voice servicio",1000.01,"CNY","G03 Gastos en general"]);
    expect(details.getCell("C3").value).toBe(3199.99);
    expect(details.getCell("C4").value).toBe(4200);
  });
  it.each([
    {kind:"generated" as const,nets:[100,-30],total:"72.03"},
    {kind:"generated" as const,nets:[-100,-30],total:"-133.77"},
    {kind:"generated" as const,nets:[100,-100],total:"0.00"},
    {kind:"external" as const,nets:[-100,-30],total:"-133.77"},
  ])("saves $kind signed service-fee periods with a $total total and independent backfills",async({kind,nets,total})=>{
    const signedRows=rows.slice(0,2).map((row,index)=>({...row,serviceFeeTotalExcludingTax:String(nets[index]),serviceFeeTotal:(nets[index]*1.029).toFixed(2),vatRate:0.029}));
    const respond=(sql:string,values:Record<string,unknown>={})=>sql.includes("FROM merge_power_servicefeesnapshots")
      ?signedRows.filter(row=>values.id?row.id===values.id:Array.isArray(values.ids)?values.ids.includes(row.id):true):query(sql,values);
    mock.query.mockImplementation(async(sql,values)=>respond(sql,values));mock.queryTx.mockImplementation(async(sql,values)=>respond(sql,values));
    const loaded=await loadAllocationSources("service_fee",signedRows.map(row=>row.id));
    expect(loaded.every(row=>!row.disabledReason)).toBe(true);
    const allocationPlan=suggestInvoiceAllocations(loaded,"USD");allocationPlan.lineMode="summary";allocationPlan.summaryCompatible=true;
    await saveInvoice({source:kind,sourceType:"service_fee",sourceId:"row0",invoiceNo:"SIGNED-PERIODS",period:"202512",customerId:"invoice-buyer-B",undertakingUnitId:"invoice-unit",currency:"USD",invoiceDate:"2026-06-01",paymentTermDays:30,dueDate:"2026-07-01",
      sellerCountry:"HK",sellerAddress:"Seller address",customerAddress:"Buyer address",bankAccount:"123456",
      ...allocationTotals(allocationPlan.allocations) as {amountExcludingTax:string;taxAmount:string;amountIncludingTax:string;taxRate:string},allocationPlan,
      ...(kind==="external"?{file:{fileName:"negative.pdf",fileType:"application/pdf",bytes:Buffer.from("fixture")}}:{})});
    expect(mock.committed).toBe(true);
    expect(mock.writes.find(row=>row.sql.includes("INSERT INTO merge_common_invoices"))?.values.amountIncludingTax).toBe(total);
    const lines=mock.writes.filter(row=>row.sql.includes("INSERT INTO merge_common_invoice_items"));expect(lines).toHaveLength(1);expect(lines[0].values.amount).toBe(total);
    const allocations=mock.writes.filter(row=>row.sql.includes("INSERT INTO merge_common_invoice_allocations"));
    expect(allocations.map(row=>row.values.amountIncludingTax)).toEqual(signedRows.map(row=>row.serviceFeeTotal));
    const backfills=mock.writes.filter(row=>row.sql.includes("UPDATE merge_power_servicefeesnapshots"));
    expect(backfills.map(row=>row.values.total)).toEqual(signedRows.map(row=>row.serviceFeeTotal));
    expect(backfills.map(row=>row.values.net)).toEqual(nets.map(value=>value.toFixed(2)));
    expect(backfills.map(row=>row.sql).join("\n")).not.toMatch(/(?:SET|,)\s*(?:serviceFeeTotal\w*|repayment\w*|status)\s*=/);
  });
  it.each(["cloud_row","service_fee"] as const)("automatically registers a single-line approval return and backfills different monthly amounts for %s",async sourceType=>{
    const allocationPlan=plan(sourceType);
    allocationPlan.allocations=allocationPlan.allocations.map((row,index)=>({...row,taxRate:"6",amountExcludingTax:(700*(index+1)).toFixed(2),taxAmount:(42*(index+1)).toFixed(2),amountIncludingTax:(742*(index+1)).toFixed(2)}));
    const approval={instanceCode:"instance",status:"approved",ownerType:sourceType,ownerId:"row0",allocationSourceIds:rows.map(row=>row.id).join(","),allocationPlanJson:JSON.stringify(allocationPlan)};
    const respond=(sql:string,values:Record<string,unknown>)=>sql.includes("FROM merge_common_feishu_approvals")?[approval]:sql.includes("FROM merge_common_invoice_approval_files")?[{id:"pdf"}]:query(sql,values);
    mock.query.mockImplementation(async(sql,values)=>respond(sql,values));mock.queryTx.mockImplementation(async(sql,values)=>respond(sql,values));
    await saveInvoice({source:"external",sourceType,sourceId:"row0",invoiceNo:"APPROVAL-SIX",customerId:"invoice-buyer-B",undertakingUnitId:"invoice-unit",currency:"CNY",invoiceDate:"2026-06-01",paymentTermDays:30,dueDate:"2026-07-01",...allocationTotals(allocationPlan.allocations) as {amountExcludingTax:string;taxAmount:string;amountIncludingTax:string;taxRate:string},allocationPlan,file:{fileName:"six-months.pdf",fileType:"application/pdf",bytes:Buffer.from("fixture")}}, {name:"飞书回票自动登记"}, {instanceCode:"instance",fileId:"pdf",relatedFileIds:["pdf"],mode:"automatic"});
    expect(mock.committed).toBe(true);
    expect(mock.writes.filter(row=>row.sql.includes("INSERT INTO merge_common_invoices"))).toHaveLength(1);
    const items=mock.writes.filter(row=>row.sql.includes("INSERT INTO merge_common_invoice_items"));expect(items).toHaveLength(1);expect(items[0].values.amount).toBe("15582.00");
    const backfills=mock.writes.filter(row=>row.sql.includes(sourceType==="cloud_row"?"UPDATE merge_cloud_rows":"UPDATE merge_power_servicefeesnapshots"));
    expect(backfills).toHaveLength(6);
    for(const [index,row] of backfills.entries()){
      expect(row.values).toMatchObject({sourceId:`row${index}`,net:(700*(index+1)).toFixed(2),total:(742*(index+1)).toFixed(2),invoiceNo:"APPROVAL-SIX",invoiceDate:"2026-06-01",dueDate:"2026-07-01"});
      if(sourceType==="cloud_row")expect(row.values.taxAmount).toBe((42*(index+1)).toFixed(2));
    }
    const allocations=mock.writes.filter(row=>row.sql.includes("INSERT INTO merge_common_invoice_allocations"));expect(allocations.map(row=>row.values.taxAmount)).toEqual(allocationPlan.allocations.map(row=>row.taxAmount));
    expect(mock.writes.filter(row=>row.sql.includes("INSERT INTO merge_cloud_attachments"))).toHaveLength(6);
    const confirmed=mock.writes.find(row=>row.sql.includes("confirmedJson"));expect(JSON.parse(String(confirmed?.values.confirmed)).registrationMode).toBe("automatic");
  });
  it.each(["cloud_row","service_fee"] as const)("registers one CNY invoice and six independent allocations for %s",async sourceType=>{
    const allocationPlan=plan(sourceType);
    await saveInvoice({source:"external",sourceType,sourceId:"row0",invoiceNo:"SIX-MONTHS",customerId:"invoice-buyer-B",undertakingUnitId:"invoice-unit",currency:"CNY",invoiceDate:"2026-06-01",paymentTermDays:30,dueDate:"2026-07-01",...allocationTotals(allocationPlan.allocations) as {amountExcludingTax:string;taxAmount:string;amountIncludingTax:string;taxRate:string},allocationPlan,file:{fileName:"six-months.pdf",fileType:"application/pdf",bytes:Buffer.from("fixture")}});
    expect(mock.committed).toBe(true);
    const invoice=mock.writes.filter(row=>row.sql.includes("INSERT INTO merge_common_invoices"));expect(invoice).toHaveLength(1);
    expect(invoice[0].values).toMatchObject({customerId:"invoice-buyer-B",amountIncludingTax:"4200.00",currency:"CNY"});
    const lines=mock.writes.filter(row=>row.sql.includes("INSERT INTO merge_common_invoice_items"));expect(lines).toHaveLength(1);expect(lines[0].values).toMatchObject({description:"202512–202605服务费",amount:"4200.00"});
    const allocations=mock.writes.filter(row=>row.sql.includes("INSERT INTO merge_common_invoice_allocations"));expect(allocations).toHaveLength(6);expect(allocations.every(row=>row.values.amountIncludingTax==="700.00")).toBe(true);
    const backfills=mock.writes.filter(row=>row.sql.includes(sourceType==="cloud_row"?"UPDATE merge_cloud_rows":"UPDATE merge_power_servicefeesnapshots"));expect(backfills).toHaveLength(6);expect(backfills.every(row=>row.values.total==="700.00")).toBe(true);
    expect(backfills.map(row=>row.sql).join("\n")).not.toMatch(/(?:SET|,)\s*(?:customerReceivable\w*|serviceFeeTotal\w*|repayment\w*|collectionTotalAmount)\s*=/);
    expect(mock.writes.filter(row=>row.sql.includes("INSERT INTO merge_cloud_attachments"))).toHaveLength(6);
  });
  it("does not trust client source snapshots or cross-customer selection",async()=>{
    const p=plan();p.allocations[0].sourceTotal="999";
    const result=await prepareInvoiceAllocationPlan(p,allocationTotals(p.allocations));expect(result.allocations[0].sourceTotal).toBe("100.00");
    mock.query.mockImplementation(async(sql,values)=>sql.includes("FROM merge_cloud_rows")?query(sql,values).map((row,i)=>({...row,businessCustomerId:i?"business-A":"foreign"})):[]);
    await expect(prepareInvoiceAllocationPlan(p,allocationTotals(p.allocations))).rejects.toThrow("同一业务客户");
  });
  it("blocks an unfinished approval but permits another invoice on the same month",async()=>{
    const p=plan();mock.query.mockImplementation(async(sql,values)=>sql.includes("FROM merge_common_feishu_approvals")?[{instanceCode:"other",ownerId:"row5",serialNumber:"APP-OTHER"}]:query(sql,values));
    await expect(prepareInvoiceAllocationPlan(p,allocationTotals(p.allocations))).rejects.toThrow("APP-OTHER");
    mock.queryTx.mockImplementation(async(sql,values)=>sql.includes("FROM merge_common_invoices i")?[{id:"other",invoiceNo:"EXISTING",allocationSourceId:"row5"}]:query(sql,values));
    await expect(lockInvoiceAllocationSources({} as never,p)).resolves.toBeUndefined();
  });
  it("preserves approved source values but still validates reviewed allocations",async()=>{
    const p=plan();p.allocations[0].sourceTotal="95.00";
    const result=await prepareInvoiceAllocationPlan(p,allocationTotals(p.allocations),{snapshot:p,instanceCode:"approved"});expect(result.allocations[0].sourceTotal).toBe("95.00");
    p.allocations[0].amountIncludingTax="999";await expect(prepareInvoiceAllocationPlan(p,allocationTotals(p.allocations),{snapshot:p})).rejects.toThrow("未税金额加税金");
  });
  it("requires a current revision before replacing any existing invoice allocation",async()=>{
    const p=plan();const invoice={id:"invoice",source:"external",status:"issued",sourceType:"cloud_row",sourceId:"row0",currency:"CNY",...allocationTotals(p.allocations)};
    mock.query.mockImplementation(async(sql,values)=>sql.includes("SELECT * FROM merge_common_invoices")?[invoice]:query(sql,values));
    mock.queryTx.mockImplementation(async(sql,values)=>sql.includes("SELECT * FROM merge_common_invoices")?[invoice]:query(sql,values));
    await expect(replaceInvoiceAllocations("invoice",p,"old-revision")).rejects.toThrow("已变化");expect(mock.writes).toHaveLength(0);expect(mock.rolledBack).toBe(true);
  });
  it.each(["cloud_row","service_fee"] as const)("reallocates the same %s invoice and releases a removed month without changing its file or total",async sourceType=>{
    const previous=plan(sourceType);
    const invoice={id:"invoice",invoiceNo:"ORIGINAL",source:"external",status:"issued",sourceType,sourceId:"row0",currency:"CNY",
      invoiceDate:new Date(2026,5,1),dueDate:new Date(2026,6,1),fileName:"original.pdf",fileType:"application/pdf",fileSize:10,fileProvider:"db",fileContent:"data:application/pdf;base64,YQ==",...allocationTotals(previous.allocations),allocationPlanJson:JSON.stringify(previous)};
    const respond=(sql:string,values:Record<string,unknown>)=>sql.includes("COALESCE(a.sourceId, i.sourceId)")
      ? (mock.writes.some(row => row.sql.includes("DELETE FROM merge_common_invoice_allocations"))
        ? mock.writes.filter(row => row.sql.includes("INSERT INTO merge_common_invoice_allocations")).map(row => row.values) : previous.allocations)
          .filter(row => (values.ids as string[]).includes(String(row.sourceId))).map(row => ({ ...invoice, ...row, id: invoice.id }))
      : sql.includes("SELECT * FROM merge_common_invoices")?[invoice]:sql.includes("FROM merge_common_invoice_allocations")?previous.allocations:query(sql,values);
    mock.query.mockImplementation(async(sql,values)=>respond(sql,values));mock.queryTx.mockImplementation(async(sql,values)=>respond(sql,values));
    const edit=await readInvoiceAllocationEdit("invoice");
    const next={...previous,allocations:previous.allocations.slice(0,5).map(row=>({...row,amountExcludingTax:"840.00",amountIncludingTax:"840.00"}))};
    await replaceInvoiceAllocations("invoice",next,edit.revision);
    expect(mock.committed).toBe(true);
    const backfills=mock.writes.filter(row=>row.sql.includes(sourceType==="cloud_row"?"UPDATE merge_cloud_rows":"UPDATE merge_power_servicefeesnapshots")&&row.values.total);
    expect(backfills).toHaveLength(5);expect(backfills.every(row=>row.values.total==="840.00"&&row.values.invoiceDate==="2026-06-01")).toBe(true);
    const removal=mock.writes.find(row=>row.sql.includes(sourceType === "service_fee" ? "UPDATE merge_power_servicefeesnapshots" : "UPDATE merge_cloud_rows")&&row.values.sourceId==="row5");
    expect(removal?.values).toMatchObject({ invoiceNo: null, total: null, [sourceType === "service_fee" ? "invoiceStatus" : "collectionInvoice"]: sourceType === "service_fee" ? "未开票" : "not_issued" });
    expect(mock.writes.some(row=>row.sql.startsWith("INSERT INTO merge_common_invoices"))).toBe(false);
    expect(mock.writes.filter(row=>row.sql.startsWith("UPDATE merge_common_invoices")).every(row=>!row.sql.includes("amountIncludingTax=")&&!row.sql.includes("fileContent="))).toBe(true);
  });
  it.each(["cloud_row","service_fee"] as const)("voids all six %s allocations and unlinks the correct attachments atomically",async sourceType=>{
    const p=plan(sourceType);const invoice={id:"invoice",invoiceNo:"VOID-SIX",sourceType,sourceId:"row0",status:"issued",fileName:"six.pdf",storageKey:"invoice/six.pdf"};
    const respond=(sql:string,values:Record<string,unknown>)=>sql.includes("COALESCE(a.sourceId, i.sourceId)")?[]:sql.includes("FROM merge_common_invoices")?[invoice]:sql.includes("FROM merge_common_invoice_allocations")?p.allocations:query(sql,values);
    mock.query.mockImplementation(async(sql,values)=>respond(sql,values));mock.queryTx.mockImplementation(async(sql,values)=>respond(sql,values));
    await voidInvoice("invoice","test");expect(mock.committed).toBe(true);
    const deletes=mock.writes.filter(row=>row.sql.includes("DELETE FROM merge_cloud_attachments"));expect(deletes).toHaveLength(6);
    expect(deletes.every(row=>row.values.ownerType===(sourceType === "service_fee" ? "service_fee_invoice" : "invoice")&&row.values.storageKey==="invoice/six.pdf")).toBe(true);
    const clears=mock.writes.filter(row=>row.sql.includes(sourceType === "service_fee" ? "UPDATE merge_power_servicefeesnapshots" : "UPDATE merge_cloud_rows"));
    expect(clears).toHaveLength(6);expect(clears.every(row => row.values.total === null && row.values.invoiceNo === null)).toBe(true);
    expect(mock.writes.some(row=>row.sql.includes("fileContent = NULL"))).toBe(false);
  });
  it("rolls back a combined void when any month fails",async()=>{
    const p=plan();const invoice={id:"invoice",invoiceNo:"VOID-SIX",sourceType:"cloud_row",sourceId:"row0",status:"issued",fileName:"six.pdf"};
    const respond=(sql:string,values:Record<string,unknown>)=>sql.includes("FROM merge_common_invoices")?[invoice]:sql.includes("FROM merge_common_invoice_allocations")?p.allocations:query(sql,values);
    mock.query.mockImplementation(async(sql,values)=>respond(sql,values));mock.queryTx.mockImplementation(async(sql,values)=>respond(sql,values));
    mock.execute.mockImplementation(async(sql,values)=>{if(sql.includes("UPDATE merge_cloud_rows")&&values.sourceId==="row3")throw new Error("write failed");});
    await expect(voidInvoice("invoice","test")).rejects.toThrow("write failed");expect(mock.rolledBack).toBe(true);expect(mock.committed).toBe(false);
  });
  it("generates a finance-readable workbook containing the full cross-year range",async()=>{
    const file=await invoiceAllocationAttachment(plan());const ExcelJS=(await import("exceljs")).default;const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(file.bytes as never);
    const sheet=workbook.worksheets[0];expect(sheet.getCell("B1").value).toBe("合并为一行");expect(sheet.getCell("B2").value).toBe("202512–202605服务费");expect(sheet.getCell("I11").value).toBe(4200);
  },20000);
});
