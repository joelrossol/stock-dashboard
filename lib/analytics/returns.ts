/** Return math: time-weighted, money-weighted (XIRR), shadow benchmark, attribution. */
import { diffDays } from "@/lib/dates";
import type { Transaction } from "@/lib/data/types";
import type { CloseLookup, DailyPoint } from "./reconstruct";

/**
 * Cumulative time-weighted index (starts at 1). Flows are assumed to land
 * at the end of the day, so a deposit doesn't count as a gain.
 */
export function twrIndex(points: Pick<DailyPoint, "value" | "flow">[]): number[] {
  const idx: number[] = [];
  let level = 1;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const prev = points[i - 1].value;
      if (prev > 0) {
        const r = (points[i].value - points[i].flow) / prev - 1;
        level *= 1 + r;
      }
    }
    idx.push(level);
  }
  return idx;
}

export function twrBetween(index: number[], from: number, to: number): number {
  if (from < 0 || to >= index.length || from >= to) return 0;
  return index[to] / index[from] - 1;
}

/** Market gain between two points, excluding deposits and withdrawals. */
export function gainBetween(points: Pick<DailyPoint, "value" | "flow">[], from: number, to: number): number {
  let flows = 0;
  for (let i = from + 1; i <= to; i++) flows += points[i].flow;
  return points[to].value - points[from].value - flows;
}

export interface CashFlow {
  date: string;
  amount: number; // investor's perspective: − = paid in, + = received
}

/** Annualized money-weighted return. */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const t0 = flows[0].date;
  const yrs = flows.map((f) => diffDays(t0, f.date) / 365);
  const npv = (r: number) => flows.reduce((s, f, i) => s + f.amount / (1 + r) ** yrs[i], 0);
  let lo = -0.99;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (fLo * fHi > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (fLo * fm < 0) hi = mid;
    else {
      lo = mid;
      fLo = fm;
    }
  }
  return (lo + hi) / 2;
}

export function xirrForRange(points: DailyPoint[], from: number, to: number): number | null {
  if (to - from < 20) return null;
  const flows: CashFlow[] = [{ date: points[from].date, amount: -points[from].value }];
  for (let i = from + 1; i <= to; i++) if (points[i].flow) flows.push({ date: points[i].date, amount: -points[i].flow });
  flows.push({ date: points[to].date, amount: points[to].value });
  return xirr(flows);
}

/** What the account would be worth if every dollar had gone into the benchmark. */
export function shadowSeries(points: DailyPoint[], from: number, benchSymbol: string, close: CloseLookup): number[] {
  const out: number[] = new Array(points.length).fill(NaN);
  if (from < 0 || from >= points.length) return out;
  let units = points[from].value / close(benchSymbol, points[from].date);
  out[from] = points[from].value;
  for (let i = from + 1; i < points.length; i++) {
    const px = close(benchSymbol, points[i].date);
    if (points[i].flow) units += points[i].flow / px;
    out[i] = units * px;
  }
  return out;
}

export interface Contribution {
  symbol: string;
  pnl: number;
  share: number; // of total P&L
  startValue: number;
  endValue: number;
}

/** Dollar P&L by symbol between two dates: Δvalue − buys + sells + dividends. */
export function contributions(points: DailyPoint[], from: number, to: number, txns: Transaction[], close: CloseLookup): Contribution[] {
  const a = points[from];
  const b = points[to];
  const syms = new Set([...Object.keys(a.holdings), ...Object.keys(b.holdings)]);
  const inRange = txns.filter((t) => t.symbol && t.date > a.date && t.date <= b.date);
  for (const t of inRange) syms.add(t.symbol!);
  const rows: Contribution[] = [];
  let total = 0;
  for (const s of syms) {
    const startValue = (a.holdings[s] ?? 0) * close(s, a.date);
    const endValue = (b.holdings[s] ?? 0) * close(s, b.date);
    const cash = inRange.filter((t) => t.symbol === s).reduce((sum, t) => sum + t.netAmount, 0);
    const pnl = endValue - startValue + cash;
    total += pnl;
    rows.push({ symbol: s, pnl, share: 0, startValue, endValue });
  }
  const denom = rows.filter((r) => r.pnl > 0).reduce((s, r) => s + r.pnl, 0) || Math.abs(total) || 1;
  return rows.map((r) => ({ ...r, share: r.pnl / denom })).sort((x, y) => y.pnl - x.pnl);
}
