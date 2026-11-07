/** FIFO lot matching, hindsight review, grading, scorecard, and tax views. */
import { addDays, diffDays, yearStart } from "@/lib/dates";
import type { Account, Bar, Transaction } from "@/lib/data/types";
import { clamp, mean } from "./indicators";

export interface LotMatch {
  accountId: string;
  symbol: string;
  qty: number;
  buyTxnId: string;
  buyDate: string;
  buyPrice: number;
  sellTxnId: string;
  sellDate: string;
  sellPrice: number;
  pnl: number;
  holdingDays: number;
  term: "short" | "long";
}

export interface OpenLot {
  accountId: string;
  symbol: string;
  qty: number;
  price: number;
  date: string;
  txnId: string;
}

const isLongTerm = (buy: string, sell: string) => sell > addDays(buy, 365);

export function fifoMatch(txns: Transaction[]): { matches: LotMatch[]; open: OpenLot[] } {
  const queues = new Map<string, OpenLot[]>();
  const matches: LotMatch[] = [];
  const sorted = [...txns].sort((a, b) => a.time.localeCompare(b.time));
  for (const t of sorted) {
    if (!t.symbol || (t.kind !== "BUY" && t.kind !== "SELL")) continue;
    const key = `${t.accountId}|${t.symbol}`;
    const q = queues.get(key) ?? [];
    queues.set(key, q);
    const qty = Math.abs(t.quantity);
    if (t.kind === "BUY") {
      const price = t.price ?? Math.abs(t.netAmount) / qty;
      q.push({ accountId: t.accountId, symbol: t.symbol, qty, price, date: t.date, txnId: t.id });
      continue;
    }
    const sellPrice = t.netAmount / qty; // net of fees
    let left = qty;
    while (left > 1e-9 && q.length) {
      const lot = q[0];
      const take = Math.min(left, lot.qty);
      matches.push({
        accountId: t.accountId,
        symbol: t.symbol,
        qty: take,
        buyTxnId: lot.txnId,
        buyDate: lot.date,
        buyPrice: lot.price,
        sellTxnId: t.id,
        sellDate: t.date,
        sellPrice,
        pnl: take * (sellPrice - lot.price),
        holdingDays: diffDays(lot.date, t.date),
        term: isLongTerm(lot.date, t.date) ? "long" : "short",
      });
      lot.qty -= take;
      left -= take;
      if (lot.qty <= 1e-9) q.shift();
    }
  }
  const open = [...queues.values()].flat().filter((l) => l.qty > 1e-9);
  return { matches, open };
}

// ─── Hindsight & grading ──────────────────────────────────────────────

export type Grade = "A" | "B" | "C" | "D" | "F";

export function gradeOf(score: number): Grade {
  if (score >= 0.8) return "A";
  if (score >= 0.65) return "B";
  if (score >= 0.5) return "C";
  if (score >= 0.35) return "D";
  return "F";
}

export interface HorizonResult {
  label: string;
  days: number | null; // null = today
  available: boolean;
  stockRet: number;
  benchRet: number;
  excess: number; // from the decision's point of view
  score: number;
  grade: Grade;
}

export interface TradeReview {
  txn: Transaction;
  side: "BUY" | "SELL";
  symbol: string;
  accountId: string;
  date: string;
  qty: number;
  price: number;
  amount: number;
  current: number;
  sinceTrade: number;
  benchSince: number;
  timingPct: number; // 0 = traded at the window low, 1 = at the high
  horizons: HorizonResult[];
  score: number;
  grade: Grade;
  verdict: string;
  verdictTone: "up" | "down" | "flat";
  // Sells
  proceeds?: number;
  valueIfHeld?: number;
  missedDividends?: number;
  heldDiff?: number; // + means holding would have been better
  maxAfter?: number;
  realizedPnl?: number;
  realizedPct?: number;
  holdingDays?: number;
  // Buys
  alpha?: number;
  mae?: number; // worst drop after buying (≤ 0)
  stillHeld?: number;
  matches: LotMatch[];
}

const HORIZONS: [string, number | null][] = [
  ["30 days", 30],
  ["90 days", 90],
  ["180 days", 180],
  ["Today", null],
];

function indexOnOrAfter(bars: Bar[], date: string): number {
  let lo = 0;
  let hi = bars.length - 1;
  if (bars.length === 0 || bars[hi].date < date) return -1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date < date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function reviewTrades(opts: {
  txns: Transaction[];
  daily: Record<string, Bar[]>;
  bench: Bar[];
  divPerShare: Record<string, number>; // annual
  asOf: string;
}): { reviews: TradeReview[]; matches: LotMatch[]; open: OpenLot[] } {
  const { txns, daily, bench, divPerShare, asOf } = opts;
  const { matches, open } = fifoMatch(txns);
  const bySell = new Map<string, LotMatch[]>();
  const byBuy = new Map<string, LotMatch[]>();
  for (const m of matches) {
    (bySell.get(m.sellTxnId) ?? bySell.set(m.sellTxnId, []).get(m.sellTxnId)!).push(m);
    (byBuy.get(m.buyTxnId) ?? byBuy.set(m.buyTxnId, []).get(m.buyTxnId)!).push(m);
  }
  const openByTxn = new Map<string, number>();
  for (const l of open) openByTxn.set(l.txnId, (openByTxn.get(l.txnId) ?? 0) + l.qty);

  const reviews: TradeReview[] = [];
  for (const t of txns) {
    if ((t.kind !== "BUY" && t.kind !== "SELL") || !t.symbol) continue;
    const bars = daily[t.symbol];
    if (!bars?.length) continue;
    const side = t.kind;
    const qty = Math.abs(t.quantity);
    const price = t.price ?? Math.abs(t.netAmount) / qty;
    const i0 = indexOnOrAfter(bars, t.date);
    const b0 = indexOnOrAfter(bench, t.date);
    if (i0 < 0 || b0 < 0) continue;
    const current = bars.at(-1)!.close;
    const benchNow = bench.at(-1)!.close;
    const benchAt = bench[b0].close;
    const sinceTrade = current / price - 1;
    const benchSince = benchNow / benchAt - 1;

    const lo = Math.max(0, i0 - 10);
    const hi = Math.min(bars.length - 1, i0 + 10);
    const window = bars.slice(lo, hi + 1).map((b) => b.close);
    const wMin = Math.min(...window, price);
    const wMax = Math.max(...window, price);
    const timingPct = wMax > wMin ? (price - wMin) / (wMax - wMin) : 0.5;
    const sTiming = side === "BUY" ? 1 - timingPct : timingPct;

    const horizons: HorizonResult[] = HORIZONS.map(([label, days]) => {
      const endDate = days == null ? asOf : addDays(t.date, days);
      const available = days == null || endDate <= asOf;
      const iEnd = days == null ? bars.length - 1 : indexOnOrAfter(bars, endDate);
      const bEnd = days == null ? bench.length - 1 : indexOnOrAfter(bench, endDate);
      if (!available || iEnd < 0 || bEnd < 0) {
        return { label, days, available: false, stockRet: 0, benchRet: 0, excess: 0, score: 0, grade: "C" as Grade };
      }
      const stockRet = bars[iEnd].close / price - 1;
      const benchRet = bench[bEnd].close / benchAt - 1;
      const raw = stockRet - benchRet;
      const excess = side === "BUY" ? raw : -raw;
      const path = bars.slice(i0, iEnd + 1).map((b) => b.close);
      const worst = Math.min(...path, price) / price - 1;
      const sRisk = side === "BUY" ? clamp(1 + worst / 0.25, 0, 1) : clamp(-worst / 0.25, 0, 1);
      const sEx = clamp(0.5 + excess / 0.4, 0, 1);
      const score = 0.6 * sEx + 0.25 * sTiming + 0.15 * sRisk;
      return { label, days, available: true, stockRet, benchRet, excess, score, grade: gradeOf(score) };
    });
    const avail = horizons.filter((h) => h.available);
    const score = avail.length ? mean(avail.map((h) => h.score)) : 0.5;

    const r: TradeReview = {
      txn: t,
      side,
      symbol: t.symbol,
      accountId: t.accountId,
      date: t.date,
      qty,
      price,
      amount: t.netAmount,
      current,
      sinceTrade,
      benchSince,
      timingPct,
      horizons,
      score,
      grade: gradeOf(score),
      verdict: "",
      verdictTone: "flat",
      matches: [],
    };

    if (side === "SELL") {
      const ms = bySell.get(t.id) ?? [];
      const proceeds = t.netAmount;
      const years = Math.max(0, diffDays(t.date, asOf) / 365);
      const missedDividends = qty * (divPerShare[t.symbol] ?? 0) * years;
      const valueIfHeld = qty * current + missedDividends;
      const realizedPnl = ms.reduce((s, m) => s + m.pnl, 0);
      const cost = ms.reduce((s, m) => s + m.qty * m.buyPrice, 0);
      const after = bars.slice(i0 + 1).map((b) => b.close);
      Object.assign(r, {
        proceeds,
        valueIfHeld,
        missedDividends,
        heldDiff: valueIfHeld - proceeds,
        maxAfter: after.length ? Math.max(...after) : price,
        realizedPnl,
        realizedPct: cost > 0 ? realizedPnl / cost : 0,
        holdingDays: ms.length ? Math.round(ms.reduce((s, m) => s + m.holdingDays * m.qty, 0) / ms.reduce((s, m) => s + m.qty, 0)) : 0,
        matches: ms,
      });
      const rel = r.heldDiff! / proceeds;
      if (rel > 0.1) {
        r.verdict = `Sold too soon: holding would be worth $${Math.round(r.heldDiff!).toLocaleString()} more`;
        r.verdictTone = "down";
      } else if (rel < -0.05) {
        r.verdict = `Good exit: avoided a $${Math.round(-r.heldDiff!).toLocaleString()} decline`;
        r.verdictTone = "up";
      } else {
        r.verdict = "About even with holding";
      }
    } else {
      const sold = (byBuy.get(t.id) ?? []).reduce((s, m) => s + m.qty, 0);
      const stillHeld = openByTxn.get(t.id) ?? 0;
      const path = bars.slice(i0).map((b) => b.close);
      Object.assign(r, {
        alpha: sinceTrade - benchSince,
        mae: Math.min(...path, price) / price - 1,
        stillHeld,
        matches: byBuy.get(t.id) ?? [],
      });
      const alpha = r.alpha!;
      if (alpha > 0.05) {
        r.verdict = `Beat the S&P by ${(alpha * 100).toFixed(1)} pts since buying`;
        r.verdictTone = "up";
      } else if (alpha < -0.05) {
        r.verdict = `Trailing the S&P by ${(-alpha * 100).toFixed(1)} pts since buying`;
        r.verdictTone = "down";
      } else {
        r.verdict = "Roughly in line with the S&P";
      }
      if (sold > 0 && stillHeld === 0) r.verdict += " (since sold)";
    }
    reviews.push(r);
  }
  reviews.sort((a, b) => b.txn.time.localeCompare(a.txn.time));
  return { reviews, matches, open };
}

// ─── Scorecard ────────────────────────────────────────────────────────

export interface RoundTrip {
  sellTxnId: string;
  symbol: string;
  accountId: string;
  sellDate: string;
  pnl: number;
  pct: number;
  holdingDays: number;
}

export interface Scorecard {
  roundTrips: RoundTrip[];
  wins: number;
  losses: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  expectancy: number;
  realizedTotal: number;
  leftOnTable: number;
  savedBySelling: number;
  sellsBetterHeld: number; // fraction of sells
  avgHoldWinners: number;
  avgHoldLosers: number;
  dispositionRatio: number;
  avgGrade: Grade;
}

export function scorecard(reviews: TradeReview[], matches: LotMatch[]): Scorecard {
  const groups = new Map<string, LotMatch[]>();
  for (const m of matches) (groups.get(m.sellTxnId) ?? groups.set(m.sellTxnId, []).get(m.sellTxnId)!).push(m);
  const roundTrips: RoundTrip[] = [...groups.entries()].map(([id, ms]) => {
    const pnl = ms.reduce((s, m) => s + m.pnl, 0);
    const cost = ms.reduce((s, m) => s + m.qty * m.buyPrice, 0);
    const q = ms.reduce((s, m) => s + m.qty, 0);
    return {
      sellTxnId: id,
      symbol: ms[0].symbol,
      accountId: ms[0].accountId,
      sellDate: ms[0].sellDate,
      pnl,
      pct: cost ? pnl / cost : 0,
      holdingDays: ms.reduce((s, m) => s + m.holdingDays * m.qty, 0) / q,
    };
  });
  const wins = roundTrips.filter((r) => r.pnl > 0);
  const losses = roundTrips.filter((r) => r.pnl <= 0);
  const grossWin = wins.reduce((s, r) => s + r.pnl, 0);
  const grossLoss = -losses.reduce((s, r) => s + r.pnl, 0);
  const sells = reviews.filter((r) => r.side === "SELL");
  const avgHoldWinners = wins.length ? mean(wins.map((r) => r.holdingDays)) : 0;
  const avgHoldLosers = losses.length ? mean(losses.map((r) => r.holdingDays)) : 0;
  return {
    roundTrips,
    wins: wins.length,
    losses: losses.length,
    winRate: roundTrips.length ? wins.length / roundTrips.length : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    expectancy: roundTrips.length ? (grossWin - grossLoss) / roundTrips.length : 0,
    realizedTotal: grossWin - grossLoss,
    leftOnTable: sells.reduce((s, r) => s + Math.max(0, r.heldDiff ?? 0), 0),
    savedBySelling: sells.reduce((s, r) => s + Math.max(0, -(r.heldDiff ?? 0)), 0),
    sellsBetterHeld: sells.length ? sells.filter((r) => (r.heldDiff ?? 0) > 0).length / sells.length : 0,
    avgHoldWinners,
    avgHoldLosers,
    dispositionRatio: avgHoldWinners > 0 ? avgHoldLosers / avgHoldWinners : 0,
    avgGrade: gradeOf(reviews.length ? mean(reviews.map((r) => r.score)) : 0.5),
  };
}

// ─── Tax views ────────────────────────────────────────────────────────

export interface WashSale {
  sellTxnId: string;
  symbol: string;
  sellDate: string;
  sellAccountId: string;
  loss: number;
  buys: { accountId: string; date: string; qty: number; txnId: string }[];
}

export function washSales(txns: Transaction[], matches: LotMatch[], accounts: Account[]): WashSale[] {
  const taxable = new Set(accounts.filter((a) => a.taxTreatment === "taxable").map((a) => a.id));
  const out: WashSale[] = [];
  const bySell = new Map<string, LotMatch[]>();
  for (const m of matches) (bySell.get(m.sellTxnId) ?? bySell.set(m.sellTxnId, []).get(m.sellTxnId)!).push(m);
  for (const [sellId, ms] of bySell) {
    const loss = ms.reduce((s, m) => s + m.pnl, 0);
    if (loss >= 0 || !taxable.has(ms[0].accountId)) continue;
    const consumed = new Set(ms.map((m) => m.buyTxnId));
    const sellDate = ms[0].sellDate;
    const buys = txns
      .filter((t) => t.kind === "BUY" && t.symbol === ms[0].symbol && !consumed.has(t.id) && Math.abs(diffDays(sellDate, t.date)) <= 30)
      .map((t) => ({ accountId: t.accountId, date: t.date, qty: t.quantity, txnId: t.id }));
    if (buys.length) out.push({ sellTxnId: sellId, symbol: ms[0].symbol, sellDate, sellAccountId: ms[0].accountId, loss, buys });
  }
  return out;
}

export interface TaxLotView extends OpenLot {
  current: number;
  unrealized: number;
  holdingDays: number;
  longTermDate: string;
  daysToLongTerm: number; // ≤ 0 means already long-term
}

export function taxLots(open: OpenLot[], accounts: Account[], price: (s: string) => number, asOf: string): TaxLotView[] {
  const taxable = new Set(accounts.filter((a) => a.taxTreatment === "taxable").map((a) => a.id));
  return open
    .filter((l) => taxable.has(l.accountId))
    .map((l) => {
      const current = price(l.symbol);
      const longTermDate = addDays(l.date, 366);
      return {
        ...l,
        current,
        unrealized: l.qty * (current - l.price),
        holdingDays: diffDays(l.date, asOf),
        longTermDate,
        daysToLongTerm: diffDays(asOf, longTermDate),
      };
    });
}

export function realizedThisYear(matches: LotMatch[], accounts: Account[], asOf: string) {
  const taxable = new Set(accounts.filter((a) => a.taxTreatment === "taxable").map((a) => a.id));
  const ys = yearStart(asOf);
  const rows = matches.filter((m) => m.sellDate >= ys);
  const sum = (f: (m: LotMatch) => boolean) => rows.filter(f).reduce((s, m) => s + m.pnl, 0);
  return {
    all: sum(() => true),
    taxableShort: sum((m) => taxable.has(m.accountId) && m.term === "short"),
    taxableLong: sum((m) => taxable.has(m.accountId) && m.term === "long"),
    sheltered: sum((m) => !taxable.has(m.accountId)),
  };
}
