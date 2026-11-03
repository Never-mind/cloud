import { centsText, moneyCents, splitInvoiceAmount, type InvoiceAllocationSource, type InvoiceAllocationPlan } from "./invoice-allocation";

export const BATCH_SOURCE_LABELS = { service_fee: "算力服务费", cloud_row: "华为云", prepayment_contract: "预付款合同" } as const;
export type BatchSourceType = keyof typeof BATCH_SOURCE_LABELS;
export const IMPORT_LIMIT = 100;
export const DEFAULT_IMPORT_UNIT = '香港万众科技有限公司';
export const IMPORT_FIELDS = [
  ["rowKey", "导入编号"], ["module", "业务模块"], ["references", "关联单据"],
  ["customer", "开票客户"], ["unit", "开票单位"], ["currency", "币种"],
  ["gross", "含税金额"], ["taxRate", "税率%"], ["net", "未税金额"],
  ["invoiceDate", "开票日期"], ["dueDate", "应收日期"], ["paymentTermDays", "账期天数"],
  ["description", "票面描述"], ["lineMode", "票面展示"], ["invoiceNo", "发票号"],
  ["businessRates", "业务汇率"], ["usdRate", "美元汇率"], ["allocations", "分摊含税金额"], ["remark", "备注"],
] as const;
export const IMPORT_COLUMNS = IMPORT_FIELDS.filter(([key])=>key!=='rowKey');
export type ImportField = typeof IMPORT_FIELDS[number][0];
export type InvoiceImportRaw = Record<ImportField, string>;
export type BatchPreview = {
  sourceType?: BatchSourceType; sources: Array<{id:string;label:string;period:string;currency:string;referenceAmount:string;allocated:string;difference:string}>;
  customerName?: string; unitName?: string; currency?: string; net?:string; tax?:string; gross?:string;
  dueDate?:string; uploadDate?:string; reviewHash?:string; warnings:string[]; errors:string[]; existingInvoiceId?:string; existingInvoiceNo?:string;
};
export type InvoiceImportRow = {id:string;rowNo:number;raw:InvoiceImportRaw;preview:BatchPreview;status:string;invoiceId?:string;invoiceNo?:string;message?:string;version:number};
export type InvoiceImportBatch = {id:string;fileName:string;createdAt:string;rows:InvoiceImportRow[];restored?:boolean};
export function normalizeImportRaw(input: Partial<Record<ImportField, unknown>>): InvoiceImportRaw {
  return Object.fromEntries(IMPORT_FIELDS.map(([key])=>[key,String(input[key]??"").trim()])) as InvoiceImportRaw;
}
export function importUploadDate(now:Date=new Date()):string {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(type:string)=>parts.find(item=>item.type===type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function applyImportDefaults(raw:InvoiceImportRaw,uploadDate:string):InvoiceImportRaw {
  return {...raw,unit:raw.unit||DEFAULT_IMPORT_UNIT,taxRate:raw.taxRate||'0',invoiceDate:raw.invoiceDate||uploadDate};
}
export function importSourceType(value:string):BatchSourceType {
  const found = (Object.keys(BATCH_SOURCE_LABELS) as BatchSourceType[]).find(key=>key===value||BATCH_SOURCE_LABELS[key]===value);
  if (!found) throw new Error("业务模块请选择算力服务费、华为云或预付款合同");
  return found;
}
export function importList(value:string) { return value.split(/[;；\n]+/).map(item=>item.trim()).filter(Boolean); }
export function importMoney(value:string,label:string) {
  const raw=value.replace(/,/g,"");
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error(`${label}请填写最多两位小数的非负金额`);
  return centsText(moneyCents(raw));
}
export function importAmounts(raw:InvoiceImportRaw) {
  const gross=importMoney(raw.gross,"含税金额");
  if (moneyCents(gross)<=0) throw new Error("含税金额必须大于零");
  const rateText=raw.taxRate.replace(/%$/,""), rate=Number(rateText);
  if (!rateText||!Number.isFinite(rate)||rate<0||rate>100) throw new Error("税率请填0至100的百分数，无税填0");
  const net=raw.net?importMoney(raw.net,"未税金额"):centsText(Math.round(moneyCents(gross)/(1+rate/100)));
  const taxCents=moneyCents(gross)-moneyCents(net);
  if(taxCents<0||Math.abs(Math.round(moneyCents(net)*rate/100)-taxCents)>1) throw new Error("未税金额、税率与含税金额不一致");
  return {amountExcludingTax:net,taxRate:String(rate),taxAmount:centsText(taxCents),amountIncludingTax:gross};
}
export function importRates(raw:string,sourceCurrencies:string[],invoiceCurrency:string):string[] {
  const values=importList(raw);
  if(values.length>1&&values.length!==sourceCurrencies.length) throw new Error("业务汇率数量应为1个，或与关联单据数量一致（用分号分隔）");
  return sourceCurrencies.map((currency,index)=>{
    const value=values.length===1?values[0]:values[index];
    if(currency===invoiceCurrency) {
      if(value&&Number(value)!==1) throw new Error("同币种业务汇率必须为1");
      return "1";
    }
    if(!value||!Number.isFinite(Number(value))||Number(value)<=0) throw new Error(`请填写业务汇率：1 ${invoiceCurrency} = 多少 ${currency}`);
    return String(Number(value));
  });
}
export function importAllocationPlan(raw:InvoiceImportRaw,sources:InvoiceAllocationSource[],rates:string[]):InvoiceAllocationPlan {
  const totals=importAmounts(raw),currency=raw.currency.toUpperCase();
  const supplied=importList(raw.allocations);
  if(supplied.length&&supplied.length!==sources.length) throw new Error("分摊含税金额数量须与关联单据一致");
  const weights=sources.map((source,i)=>Number(source.sourceTotal)/Number(rates[i]));
  const gross=supplied.length?supplied.map(value=>importMoney(value,"分摊含税金额")):splitInvoiceAmount(totals.amountIncludingTax,weights);
  if(gross.reduce((sum,value)=>sum+moneyCents(value),0)!==moneyCents(totals.amountIncludingTax)) throw new Error("分摊含税金额合计必须等于整票含税金额");
  const nets=splitInvoiceAmount(totals.amountExcludingTax,gross.map(Number));
  return {version:1,sourceType:sources[0].sourceType,currency,lineMode:raw.lineMode==="按账期分行"?"period":"summary",description:raw.description,summaryCompatible:true,
    allocations:sources.map((source,i)=>({...source,exchangeRate:String(1/Number(rates[i])),invoiceUsdRate:raw.usdRate||undefined,
      amountExcludingTax:nets[i],taxRate:totals.taxRate,taxAmount:centsText(moneyCents(gross[i])-moneyCents(nets[i])),amountIncludingTax:gross[i]}))};
}
