import {createHash} from 'node:crypto';
import {applyImportDefaults,normalizeImportRaw,type InvoiceImportRaw} from './invoice-batch-import';

const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Stable across renames/re-saves and blank rows; occurrences keep two identical invoice rows distinct. */
export function identifyImportRows(rows:Array<{rowNo:number;raw:InvoiceImportRaw}>) {
 const occurrences=new Map<string,number>();
 const normalized=rows.map(row=>({...row,raw:applyImportDefaults(normalizeImportRaw(row.raw),'')}));
 const fileHash=digest(['invoice-import-v2',normalized.map(row=>row.raw)]);
 return {fileHash,allAutomatic:normalized.every(row=>!row.raw.rowKey),rows:normalized.map(row=>{
  if(row.raw.rowKey)return{...row,automatic:false};
  const contentHash=digest(row.raw),occurrence=(occurrences.get(contentHash)||0)+1;
  occurrences.set(contentHash,occurrence);
  return {...row,automatic:true,raw:{...row.raw,rowKey:`AUTO-${digest([contentHash,occurrence])}`}};
 })};
}
