import {describe,it,expect} from 'vitest';
import * as XLSX from 'xlsx';
import {parseInvoiceImportWorkbook,invoiceImportTemplate} from './invoice-batch-import-excel';
import {IMPORT_COLUMNS,IMPORT_FIELDS,DEFAULT_IMPORT_UNIT} from './invoice-batch-import';
function file(rows:unknown[][]){const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'开票导入');return XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}) as Buffer;}
const headers=IMPORT_FIELDS.map(([,label])=>label);
const data=['import-1','华为云','202601@account','','','USD',100,0,'','2026-11-03','','','服务费'];
describe('batch Excel input',()=>{
 it('downloads defaults without identifier or executable example invoices',async()=>{const bytes=await invoiceImportTemplate();const workbook=XLSX.read(bytes);expect(workbook.SheetNames).toEqual(['开票导入','填写说明']);const sheet=workbook.Sheets['开票导入'],rows=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1});expect(rows[0]).not.toContain('导入编号');expect(rows[1][3]).toBe(DEFAULT_IMPORT_UNIT);expect(rows[1][6]).toBe(0);expect(()=>parseInvoiceImportWorkbook(bytes)).toThrow('至少一行');});
 it('accepts the new template without identifier, tax or date values',()=>{const [row]=parseInvoiceImportWorkbook(file([IMPORT_COLUMNS.map(([,label])=>label),['华为云','202601@account','','','USD',100,'','','','','','服务费']]));expect(row.raw.rowKey).toBe('');expect(row.raw.taxRate).toBe('');expect(row.raw.invoiceDate).toBe('');expect(row.raw.gross).toBe('100');});
 it('allows optional date and tax columns to be omitted',()=>{const [row]=parseInvoiceImportWorkbook(file([['业务模块','关联单据','币种','含税金额','票面描述'],['华为云','202601@account','USD',100,'服务费']]));expect(row.raw.rowKey).toBe('');expect(row.raw.invoiceDate).toBe('');});
 it('reads numeric currency amounts and preserves textual keys',()=>{const [row]=parseInvoiceImportWorkbook(file([headers,data]));expect(row.rowNo).toBe(2);expect(row.raw.rowKey).toBe('import-1');expect(row.raw.gross).toBe('100');expect(row.raw.taxRate).toBe('0');});
 it('rejects missing and duplicate headers',()=>{expect(()=>parseInvoiceImportWorkbook(file([['x'],['test']]))).toThrow('缺少表头');expect(()=>parseInvoiceImportWorkbook(file([[...headers,'导入编号'],data]))).toThrow('重复');});
 it('enforces the 100 invoice limit before previewing or writing',()=>{expect(()=>parseInvoiceImportWorkbook(file([headers,...Array.from({length:101},()=>data)]))).toThrow('100');});
 it('reads percent-formatted tax and real Excel dates',()=>{const workbook=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([headers,data]);sheet.H2={t:'n',v:0.06,z:'0%'};sheet.J2={t:'n',v:46329,z:'yyyy-mm-dd'};XLSX.utils.book_append_sheet(workbook,sheet,'开票导入');const [row]=parseInvoiceImportWorkbook(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}));expect(row.raw.taxRate).toBe('6');expect(row.raw.invoiceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);});
});
