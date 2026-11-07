/**
 * Rebuild daily account values by walking backward from today's positions
 * and cash through known transactions. With a complete ledger this is exact;
 * with a partial one (the live API's short window) it's an estimate.
 */
import type { Bar, Transaction } from "@/lib/data/types";

export interface DailyPoint {
  date: string;
  value: number;
  cash: number;
  flow: number; // external money in (+) / out (−) that day
  holdings: Record<string, number>;
}

export type CloseLookup = (symbol: string, date: string) => number;

export function makeCloseLookup(daily: Record<string, Bar[]>): CloseLookup {
  const maps = new Map<string, Map<string, number>>();
  for (const [sym, bars] of Object.entries(daily)) maps.set(sym, new Map(bars.map((b) => [b.date, b.close])));
  const firstClose = new Map(Object.entries(daily).map(([s, b]) => [s, b[0]?.close ?? 0]));
  return (symbol, date) => maps.get(symbol)?.get(date) ?? firstClose.get(symbol) ?? 0;
}

export const isExternalFlow = (t: Transaction) => t.kind === "DEPOSIT" || t.kind === "WITHDRAWAL";

export function reconstructAccount(opts: {
  holdings: Record<string, number>;
  cash: number;
  transactions: Transaction[]; // this account only
  sessions: string[]; // oldest → newest, ending today
  close: CloseLookup;
  startDate?: string; // stop here (defaults to the first transaction)
}): DailyPoint[] {
  const { sessions, close } = opts;
  const byDate = new Map<string, Transaction[]>();
  for (const t of opts.transactions) {
    const list = byDate.get(t.date) ?? [];
    list.push(t);
    byDate.set(t.date, list);
  }
  const first = opts.transactions.reduce<string | null>((m, t) => (m == null || t.date < m ? t.date : m), null);
  const start = opts.startDate ?? first ?? sessions[sessions.length - 1];

  let cash = opts.cash;
  const qty: Record<string, number> = { ...opts.holdings };
  const out: DailyPoint[] = [];
  for (let i = sessions.length - 1; i >= 0; i--) {
    const date = sessions[i];
    if (date < start) break;
    let value = cash;
    for (const [sym, q] of Object.entries(qty)) if (q) value += q * close(sym, date);
    const todays = byDate.get(date) ?? [];
    const flow = todays.filter(isExternalFlow).reduce((s, t) => s + t.netAmount, 0);
    const holdings: Record<string, number> = {};
    for (const [s, q] of Object.entries(qty)) if (Math.abs(q) > 1e-9) holdings[s] = q;
    out.push({ date, value, cash, flow, holdings });
    for (let k = todays.length - 1; k >= 0; k--) {
      const t = todays[k];
      cash -= t.netAmount;
      if (t.symbol && t.quantity) qty[t.symbol] = (qty[t.symbol] ?? 0) - t.quantity;
    }
  }
  return out.reverse();
}

/** Sum per-account histories by date. */
export function combineHistories(histories: DailyPoint[][]): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const h of histories) {
    for (const p of h) {
      const cur = map.get(p.date);
      if (!cur) {
        map.set(p.date, { date: p.date, value: p.value, cash: p.cash, flow: p.flow, holdings: { ...p.holdings } });
      } else {
        cur.value += p.value;
        cur.cash += p.cash;
        cur.flow += p.flow;
        for (const [s, q] of Object.entries(p.holdings)) cur.holdings[s] = (cur.holdings[s] ?? 0) + q;
      }
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
