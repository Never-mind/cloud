import { describe, expect, it } from 'vitest';
import { allocateJcBalance, calculateJcTotals, contractMonth, jcComponentId, projectJcMonths } from './internal-service-fee-jc-workflow';

const base = {startMonth:'2024-01-01',quantity:32,first24UnitPrice:100,vatRate:0};
const change = {itemId:'line-1',adjustmentNo:'JC1',effectiveMonth:'2025-08-01',quantity:32,first24UnitPrice:90};

describe('JC management fees', () => {
  it('counts only first-24 price changes and spreads through the original month 60', () => {
    const [jc] = calculateJcTotals({...base,changes:[change]});
    expect(jc.ruleTotal).toBe(-1600); // five first-stage months * 32 * -10; no procurement deduction
    const months = Array.from({length:41},(_,index)=>contractMonth(change.effectiveMonth,index));
    const result = allocateJcBalance({lifetimeTotal:jc.ruleTotal,registeredTotal:0,openMonths:months});
    expect(result.rows).toHaveLength(41);
    expect(result.rows.at(-1)?.month).toBe('2028-12-01');
    expect(result.rows.slice(0,-1).every(row=>row.amount===-39.02)).toBe(true);
    expect(result.rows.reduce((sum,row)=>sum+row.amount,0)).toBeCloseTo(-1600,6);
  });
  it('records later repricing as another increment without altering the fixed historical offset', () => {
    const first = calculateJcTotals({...base,changes:[change]})[0];
    const fixedOffset = -1000-first.ruleTotal;
    const later = {...change,itemId:'line-2',adjustmentNo:'JC2',effectiveMonth:'2025-10-01',first24UnitPrice:80};
    const all = calculateJcTotals({...base,changes:[change,later]});
    expect(all.map(row=>row.ruleTotal)).toEqual([-1600,-960]);
    expect(all.reduce((sum,row)=>sum+row.ruleTotal,0)+fixedOffset).toBe(-1960);
    expect(calculateJcTotals({...base,changes:[{...change,effectiveMonth:'2026-01-01'}]})[0].ruleTotal).toBe(0);
  });
  it('preserves signed historical monthly amounts and skips closed months', () => {
    const lockedMonths = [{month:'2025-08-01',amount:-400,source:'history',locked:true}];
    const result = projectJcMonths({lifetimeTotal:-1000,effectiveMonth:'2025-08-01',endMonth:'2025-12-01',resumeMonth:'2025-09-01',lockedMonths,closedMonths:new Set(['2025-10-01'])});
    expect(result.registeredAmount).toBe(-400);
    expect(result.months).toEqual([lockedMonths[0],{month:'2025-09-01',amount:-200,locked:false,source:'auto'},{month:'2025-11-01',amount:-200,locked:false,source:'auto'},{month:'2025-12-01',amount:-200,locked:false,source:'auto'}]);
    expect(lockedMonths[0].amount).toBe(-400);
  });
  it('permits zero lifetime total with positive or negative remaining balance', () => {
    expect(allocateJcBalance({lifetimeTotal:0,registeredTotal:-12,openMonths:['2026-11-01','2026-12-01']}).rows.map(row=>row.amount)).toEqual([6,6]);
    expect(allocateJcBalance({lifetimeTotal:0,registeredTotal:12,openMonths:['2026-11-01']}).rows[0].amount).toBe(-12);
  });
  it('puts rounding residual in the final month and exposes unallocatable ended balances', () => {
    expect(allocateJcBalance({lifetimeTotal:1,registeredTotal:0,openMonths:['a','b','c']}).rows.map(row=>row.amount)).toEqual([.33,.33,.34]);
    expect(allocateJcBalance({lifetimeTotal:-1,registeredTotal:0,openMonths:['a','b','c']}).rows.map(row=>row.amount)).toEqual([-.33,-.33,-.34]);
    expect(allocateJcBalance({lifetimeTotal:10,registeredTotal:2,openMonths:[]}).unallocatedAmount).toBe(8);
    expect(allocateJcBalance({lifetimeTotal:10,registeredTotal:2,openMonths:[],postingMonth:'2030-01-01'}).rows).toEqual([{month:'2030-01-01',amount:8}]);
  });
  it('counts affected quantity and removes tax only once', () => {
    const totals = calculateJcTotals({...base,quantity:10,vatRate:.16,first24UnitPrice:116,changes:[{...change,quantity:4,first24UnitPrice:58},{...change,itemId:'line-2',quantity:4,first24UnitPrice:58}]});
    expect(totals.map(row=>row.ruleTotal)).toEqual([-1000,0]);
  });
  it('has stable source identities even for the same device in different contracts', () => {
    expect(jcComponentId('contract-a','line-1')).not.toBe(jcComponentId('contract-b','line-1'));
    expect(jcComponentId('contract-a','line-1')).toBe(jcComponentId('contract-a','line-1'));
  });
});
