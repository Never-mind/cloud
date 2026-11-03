import {describe,it,expect} from 'vitest';
import {applyImportDefaults,importUploadDate,normalizeImportRaw,DEFAULT_IMPORT_UNIT} from './invoice-batch-import';
import {identifyImportRows} from './invoice-batch-import-identity';
const blank=normalizeImportRaw({module:'华为云',references:'202601@account',currency:'USD',gross:'100',description:'服务费'});
describe('automatic import identity and defaults',()=>{
 it('uses the upload day in Shanghai even on a UTC server',()=>{
  expect(importUploadDate(new Date('2026-11-03T15:59:59Z'))).toBe('2026-11-03');
  expect(importUploadDate(new Date('2026-11-03T16:00:00Z'))).toBe('2026-11-04');
 });
 it('fills only empty defaults and keeps explicit values',()=>{
  expect(applyImportDefaults(blank,'2026-11-03')).toMatchObject({unit:DEFAULT_IMPORT_UNIT,taxRate:'0',invoiceDate:'2026-11-03'});
  expect(applyImportDefaults({...blank,unit:'其他单位',taxRate:'6',invoiceDate:'2026-10-01'},'2026-11-03')).toMatchObject({unit:'其他单位',taxRate:'6',invoiceDate:'2026-10-01'});
 });
 it('creates distinct keys for identical rows, stable across blank rows and defaults',()=>{
  const a=identifyImportRows([2,3].map(rowNo=>({rowNo,raw:blank})));
  const b=identifyImportRows([4,7].map(rowNo=>({rowNo,raw:{...blank,unit:DEFAULT_IMPORT_UNIT,taxRate:'0'}})));
  expect(a.allAutomatic).toBe(true);expect(a.rows[0].raw.rowKey).toMatch(/^AUTO-/);expect(a.rows[0].raw.rowKey).not.toBe(a.rows[1].raw.rowKey);
  expect(a.fileHash).toBe(b.fileHash);expect(a.rows.map(row=>row.raw.rowKey)).toEqual(b.rows.map(row=>row.raw.rowKey));
 });
 it('keeps unchanged row keys when other rows are added or edited',()=>{
  const a=identifyImportRows([{rowNo:2,raw:blank}]);
  const b=identifyImportRows([{rowNo:2,raw:blank},{rowNo:3,raw:{...blank,gross:'200'}}]);
  expect(a.rows[0].raw.rowKey).toBe(b.rows[0].raw.rowKey);expect(a.fileHash).not.toBe(b.fileHash);
 });
 it('retains older template keys for existing invoice deduplication',()=>{
  const result=identifyImportRows([{rowNo:2,raw:{...blank,rowKey:'OLD-1'}}]);
  expect(result.allAutomatic).toBe(false);expect(result.rows[0].raw.rowKey).toBe('OLD-1');
 });
});
