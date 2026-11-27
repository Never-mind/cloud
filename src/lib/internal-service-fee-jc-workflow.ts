import { createHash } from "node:crypto";

export type JcPriceChange = {
  itemId: string;
  adjustmentNo: string;
  effectiveMonth: string;
  quantity: number;
  first24UnitPrice: number;
};

export function jcComponentId(ledgerId: string, itemId: string) {
  return `ISF-JC-${createHash("sha256").update(JSON.stringify([ledgerId, itemId])).digest("hex").slice(0, 40)}`;
}

export function contractMonth(startMonth: string, offset: number) {
  const [year, month] = startMonth.split("-").map(Number);
  const index = year * 12 + month - 1 + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}-01`;
}

export function parseJcMonth(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])(?:-01)?$/.test(text) || !Number(text.slice(0, 4))) return "";
  return `${text.slice(0, 7)}-01`;
}

export function jcCents(value: number) {
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100);
}

// Changes arrive in confirmation order. Each JC owns only the incremental change it
// introduced to months 1–24, so confirming another JC never rewrites an earlier JC.
export function calculateJcTotals(input: {
  startMonth: string;
  quantity: number;
  first24UnitPrice: number;
  vatRate: number;
  changes: JcPriceChange[];
}) {
  if (!parseJcMonth(input.startMonth) || !Number.isFinite(input.quantity) || input.quantity <= 0 || !Number.isFinite(input.first24UnitPrice) || !Number.isFinite(input.vatRate) || input.vatRate <= -1) throw new Error('合同数量、起始月份、价格或税率不正确');
  const plan = Array.from({ length: 24 }, (_, index) => ({
    month: contractMonth(input.startMonth, index),
    prices: [{ quantity: input.quantity, price: input.first24UnitPrice }],
  }));
  return input.changes.map((change) => {
    if (!parseJcMonth(change.effectiveMonth) || !Number.isFinite(change.first24UnitPrice) || !Number.isFinite(change.quantity) || change.quantity < 0) throw new Error(`调整单 ${change.adjustmentNo} 的月份、数量或价格不正确，请先核对`);
    const affectedQuantity = change.quantity > 0 ? Math.min(change.quantity, input.quantity) : input.quantity;
    let incrementalRevenue = 0;
    for (const month of plan) {
      if (month.month < change.effectiveMonth || affectedQuantity <= 0) continue;
      let left = affectedQuantity;
      const unaffected: typeof month.prices = [];
      for (const group of month.prices) {
        const replaced = Math.min(left, group.quantity);
        incrementalRevenue += (change.first24UnitPrice - group.price) * replaced;
        left -= replaced;
        if (group.quantity > replaced) unaffected.push({ quantity: group.quantity - replaced, price: group.price });
      }
      month.prices = [{ quantity: affectedQuantity, price: change.first24UnitPrice }, ...unaffected];
    }
    return {
      ...change,
      quantity: affectedQuantity,
      ruleTotal: jcCents(incrementalRevenue / (1 + input.vatRate)) / 100,
    };
  });
}

export type JcMonth = { month: string; amount: number; reportingAmount?: number; source: string; locked: boolean };

export function projectJcMonths(input: {
  lifetimeTotal: number;
  effectiveMonth: string;
  endMonth: string;
  resumeMonth: string;
  postingMonth?: string | null;
  lockedMonths: JcMonth[];
  closedMonths: Set<string>;
}) {
  const locked = new Set(input.lockedMonths.map((row) => row.month));
  const registeredAmount = input.lockedMonths.reduce((total, row) => total + jcCents(row.amount), 0) / 100;
  const firstMonth = input.resumeMonth > input.effectiveMonth ? input.resumeMonth : input.effectiveMonth;
  const openMonths: string[] = [];
  for (let month = firstMonth; month <= input.endMonth; month = contractMonth(month, 1)) {
    if (!locked.has(month) && !input.closedMonths.has(month)) openMonths.push(month);
  }
  const postingMonth = input.postingMonth;
  const canPost = postingMonth && !locked.has(postingMonth) && !input.closedMonths.has(postingMonth);
  const allocation = allocateJcBalance({ lifetimeTotal: input.lifetimeTotal, registeredTotal: registeredAmount, openMonths, postingMonth: canPost ? postingMonth : null });
  const computed = allocation.rows.map((row) => ({ ...row, locked: false, source: row.month === postingMonth ? 'settlement' : 'auto' }));
  return {
    registeredAmount,
    remainingAmount: allocation.remainingAmount,
    unallocatedAmount: allocation.unallocatedAmount,
    months: [...input.lockedMonths, ...computed].sort((left, right) => left.month.localeCompare(right.month)),
  };
}

export function allocateJcBalance(input: {
  lifetimeTotal: number;
  registeredTotal: number;
  openMonths: string[];
  postingMonth?: string | null;
}) {
  const balance = jcCents(input.lifetimeTotal) - jcCents(input.registeredTotal);
  const months = input.openMonths.length ? input.openMonths : input.postingMonth ? [input.postingMonth] : [];
  const perMonth = months.length ? Math.sign(balance) * Math.round(Math.abs(balance) / months.length) : 0;
  return {
    remainingAmount: balance / 100,
    unallocatedAmount: months.length ? 0 : balance / 100,
    rows: months.map((month, index) => ({
      month,
      amount: (index === months.length - 1 ? balance - perMonth * index : perMonth) / 100,
    })),
  };
}
