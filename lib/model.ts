/**
 * The portfolio model: one place that turns PortfolioData + scope + settings
 * into everything the pages render. Memoized per request inputs.
 */
import "server-only";
import { computeMetrics, type SymbolMetrics } from "@/lib/analytics/metrics";
import { combineHistories, makeCloseLookup, reconstructAccount, type CloseLookup, type DailyPoint } from "@/lib/analytics/reconstruct";
import { gainBetween, shadowSeries, twrBetween, twrIndex } from "@/lib/analytics/returns";
import { isDiversified } from "@/lib/data/classify";
import { alignedReturns, correlatedClusters, riskShares, type RiskHolding } from "@/lib/analytics/portfolioRisk";
import { generateSignals, groupSignals, type HoldingContext, type InsightGroup, type Signal } from "@/lib/analytics/signals";
import type { Thresholds } from "@/lib/analytics/thresholds";
import {
  realizedThisYear,
  reviewTrades,
  scorecard,
  taxLots,
  washSales,
  type LotMatch,
  type OpenLot,
  type Scorecard,
  type TaxLotView,
  type TradeReview,
  type WashSale,
} from "@/lib/analytics/trades";
import { addDays, diffDays, fmtDate, fmtTimeET, dayName, yearStart } from "@/lib/dates";
import type { Account, PortfolioData, Position, Scope, Transaction } from "@/lib/data/types";
import type { Suppression, Watchlist } from "@/lib/db/queries";

export const RANGES = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"] as const;
export type RangeKey = (typeof RANGES)[number];

export interface SeriesPoint {
  t: number;
  label: string;
  v: number;
  b: number;
}

export interface RangeSeries {
  key: RangeKey;
  points: SeriesPoint[];
  deposits: number[];
  gain: number;
  gainPct: number;
  benchPct: number;
  high: number;
  low: number;
}

export interface HoldingAccountSplit {
  accountId: string;
  name: string;
  color: string;
  quantity: number;
  avgCost: number;
  marketValue: number;
  gain: number;
  gainPct: number;
}

export interface HoldingRow {
  symbol: string;
  name: string;
  sector: string;
  assetType: string;
  quantity: number;
  avgCost: number;
  costBasis: number;
  marketValue: number;
  weight: number;
  price: number;
  dayChange: number;
  dayPct: number;
  dayPL: number;
  gain: number;
  gainPct: number;
  w1: number | null;
  m1: number | null;
  ytd: number | null;
  spark: number[];
  trendScore: number;
  trendLabel: string;
  accounts: HoldingAccountSplit[];
  tags: { tag: string; severity: Signal["severity"] }[];
}

export interface AccountSummary {
  account: Account;
  value: number;
  dayChange: number;
  dayPct: number;
  share: number;
  spark: number[];
  positions: number;
}

export interface PortfolioModel {
  data: PortfolioData;
  scope: Scope;
  scopeLabel: string;
  accounts: Account[];
  positions: Position[];
  txns: Transaction[];
  close: CloseLookup;
  sessions: string[];
  total: number;
  cash: number;
  invested: number;
  costBasis: number;
  unrealized: number;
  dayPL: number;
  dayPct: number;
  holdings: HoldingRow[];
  accountSummaries: AccountSummary[];
  metrics: Record<string, SymbolMetrics>;
  history: DailyPoint[];
  twr: number[];
  sectorWeights: { sector: string; weight: number; value: number }[];
  signals: Signal[];
  groups: InsightGroup[];
  urgentCount: number;
  suppressed: Signal[];
  reviews: TradeReview[];
  matches: LotMatch[];
  openLots: OpenLot[];
  scorecard: Scorecard;
  washSales: WashSale[];
  taxLots: TaxLotView[];
  realized: ReturnType<typeof realizedThisYear>;
  ytd: { twr: number; bench: number; gain: number };
  fwdDividends: number;
  dividendsYtd: number;
  thresholds: Thresholds;
}

const metricsCache = new WeakMap<PortfolioData, Map<number, Record<string, SymbolMetrics>>>();

export function allMetrics(data: PortfolioData, crossWithin: number): Record<string, SymbolMetrics> {
  let byWindow = metricsCache.get(data);
  if (!byWindow) metricsCache.set(data, (byWindow = new Map()));
  const hit = byWindow.get(crossWithin);
  if (hit) return hit;
  const spy = data.daily.SPY ?? [];
  const out: Record<string, SymbolMetrics> = {};
  for (const [s, bars] of Object.entries(data.daily)) if (bars.length > 30) out[s] = computeMetrics(s, bars, spy, data.asOf, { crossWithin, volumePace: data.volumePace ?? 1 });
  byWindow.set(crossWithin, out);
  return out;
}

const modelCache = new WeakMap<PortfolioData, Map<string, PortfolioModel>>();

export function buildModel(
  data: PortfolioData,
  scope: Scope,
  thresholds: Thresholds,
  suppression: Suppression,
  watchlists: Watchlist[],
): PortfolioModel {
  const key = JSON.stringify([scope, thresholds, [...suppression.snoozes], [...suppression.mutes], watchlists.map((w) => w.items.map((i) => [i.symbol, i.targetPrice]))]);
  let perData = modelCache.get(data);
  if (!perData) modelCache.set(data, (perData = new Map()));
  const hit = perData.get(key);
  if (hit) return hit;
  const model = compute(data, scope, thresholds, suppression, watchlists);
  perData.set(key, model);
  return model;
}

function compute(data: PortfolioData, scope: Scope, t: Thresholds, suppression: Suppression, watchlists: Watchlist[]): PortfolioModel {
  const accounts = scope === "all" ? data.accounts : data.accounts.filter((a) => a.id === scope);
  const ids = new Set(accounts.map((a) => a.id));
  // Day $ = shares × today's price change. Schwab's own currentDayProfitLoss can swing
  // wildly when shares were bought, sold, or moved between accounts that day.
  const positions = data.positions
    .filter((p) => ids.has(p.accountId))
    .map((p) => {
      const change = data.quotes[p.symbol]?.change;
      return change != null && Number.isFinite(change) ? { ...p, dayPL: p.quantity * change } : p;
    });
  const txns = data.transactions.filter((x) => ids.has(x.accountId));
  const close = makeCloseLookup(data.daily);
  const sessions = (data.daily.SPY ?? []).map((b) => b.date);
  const metrics = allMetrics(data, t.crossWithin);
  const q = (s: string) => data.quotes[s];

  const cash = accounts.reduce((s, a) => s + a.cash, 0);
  const invested = positions.reduce((s, p) => s + p.marketValue, 0);
  const total = cash + invested;
  const costBasis = positions.reduce((s, p) => s + p.costBasis, 0);
  const dayPL = positions.reduce((s, p) => s + p.dayPL, 0);

  // History per account, rebuilt from positions + transactions.
  const perAccount: Record<string, DailyPoint[]> = {};
  const oneYearAgo = sessions[Math.max(0, sessions.length - 253)];
  for (const a of accounts) {
    const holdings: Record<string, number> = {};
    for (const p of positions.filter((x) => x.accountId === a.id)) holdings[p.symbol] = (holdings[p.symbol] ?? 0) + p.quantity;
    const acctTxns = txns.filter((x) => x.accountId === a.id);
    // Live history is only as deep as Schwab's transaction window, so rebuild at least a year
    // (assuming no unseen trades before that) and let recorded snapshots override estimates.
    const firstTxn = acctTxns[0]?.date;
    const startDate = data.mode === "live" ? (firstTxn && firstTxn < oneYearAgo ? firstTxn : oneYearAgo) : undefined;
    const pts = reconstructAccount({ holdings, cash: a.cash, transactions: acctTxns, sessions, close, startDate });
    // Positions without price history (options, money-market funds) are carried at today's value.
    const residual = pts.length ? a.liquidationValue - pts[pts.length - 1].value : 0;
    const snaps = new Map((data.snapshots?.[a.id] ?? []).map((s) => [s.date, s.value]));
    perAccount[a.id] = pts.map((p) => ({ ...p, value: snaps.get(p.date) ?? p.value + (Math.abs(residual) > 1 ? residual : 0) }));
  }
  const history = combineHistories(Object.values(perAccount));
  const twr = twrIndex(history);
  const prevTotal = history.length > 1 ? history[history.length - 2].value : total;
  const dayPct = prevTotal > 0 ? dayPL / prevTotal : 0;

  // Combined holdings.
  const bySymbol = new Map<string, Position[]>();
  for (const p of positions) (bySymbol.get(p.symbol) ?? bySymbol.set(p.symbol, []).get(p.symbol)!).push(p);
  const accountById = new Map(data.accounts.map((a) => [a.id, a]));
  const holdingsBase = [...bySymbol.entries()].map(([symbol, ps]) => {
    const quantity = ps.reduce((s, p) => s + p.quantity, 0);
    const cb = ps.reduce((s, p) => s + p.costBasis, 0);
    const mv = ps.reduce((s, p) => s + p.marketValue, 0);
    const quote = q(symbol);
    const m = metrics[symbol];
    const inst = data.instruments[symbol];
    const bars = data.daily[symbol] ?? [];
    return {
      symbol,
      name: inst?.name ?? quote?.name ?? symbol,
      sector: inst?.sector ?? "Other",
      assetType: ps[0].assetType,
      quantity,
      avgCost: quantity ? cb / quantity : 0,
      costBasis: cb,
      marketValue: mv,
      weight: total > 0 ? mv / total : 0,
      price: quote?.last ?? (quantity ? mv / quantity : 0),
      dayChange: quote?.change ?? 0,
      dayPct: quote?.changePct ?? 0,
      dayPL: ps.reduce((s, p) => s + p.dayPL, 0),
      gain: mv - cb,
      gainPct: cb > 0 ? mv / cb - 1 : 0,
      w1: m?.ret5d ?? null,
      m1: m?.ret1m ?? null,
      ytd: m?.retYtd ?? null,
      spark: bars.slice(-30).map((b) => b.close),
      trendScore: m?.trendScore ?? 0,
      trendLabel: m?.trendLabel ?? "Neutral",
      accounts: ps
        .map((p) => {
          const a = accountById.get(p.accountId)!;
          return {
            accountId: p.accountId,
            name: a.name,
            color: a.color,
            quantity: p.quantity,
            avgCost: p.averagePrice,
            marketValue: p.marketValue,
            gain: p.marketValue - p.costBasis,
            gainPct: p.costBasis > 0 ? p.marketValue / p.costBasis - 1 : 0,
          };
        })
        .sort((x, y) => y.marketValue - x.marketValue),
      tags: [] as HoldingRow["tags"],
    };
  });
  holdingsBase.sort((a, b) => b.marketValue - a.marketValue);

  const sectorMap = new Map<string, number>();
  for (const h of holdingsBase) sectorMap.set(h.sector, (sectorMap.get(h.sector) ?? 0) + h.marketValue);
  const sectorWeights = [...sectorMap.entries()]
    .map(([sector, value]) => ({ sector, value, weight: total > 0 ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);

  // Trades and tax.
  const divPerShare = Object.fromEntries(Object.values(data.quotes).map((x) => [x.symbol, x.divAmount]));
  const { reviews, matches, open } = reviewTrades({ txns, daily: data.daily, bench: data.daily.SPY ?? [], divPerShare, asOf: data.asOf });
  const sc = scorecard(reviews, matches);
  const ws = washSales(txns, matches, accounts);
  const lots = taxLots(open, accounts, (s) => q(s)?.last ?? 0, data.asOf);
  const realized = realizedThisYear(matches, accounts, data.asOf);

  // Signals.
  const firstBuy = new Map<string, string>();
  for (const l of open) if (!firstBuy.has(l.symbol) || l.date < firstBuy.get(l.symbol)!) firstBuy.set(l.symbol, l.date);
  const yearAgo = sessions[Math.max(0, sessions.length - 252)] ?? data.asOf;
  const peakSince = (symbol: string): HoldingContext["peak"] => {
    // Highest close since the earliest open lot; positions with no buy on record use the last year.
    const bought = firstBuy.get(symbol);
    const since = bought && bought > yearAgo ? bought : yearAgo;
    let best: { price: number; date: string } | undefined;
    for (const b of data.daily[symbol] ?? []) if (b.date >= since && (!best || b.close > best.price)) best = { price: b.close, date: b.date };
    return best && { ...best, since };
  };
  const holdingCtx: HoldingContext[] = holdingsBase.map((h) => ({
    symbol: h.symbol,
    weight: h.weight,
    value: h.marketValue,
    unrealizedPct: h.gainPct,
    sector: h.sector,
    quantity: h.quantity,
    avgCost: h.avgCost,
    peak: peakSince(h.symbol),
    nextExDate: q(h.symbol)?.nextExDate,
    divPerShare: q(h.symbol)?.divAmount,
  }));
  const held = new Set(holdingsBase.map((h) => h.symbol));
  const watchMap = new Map<string, { symbol: string; target?: number }>();
  for (const i of watchlists.flatMap((w) => w.items)) {
    if (held.has(i.symbol)) continue;
    const prev = watchMap.get(i.symbol);
    watchMap.set(i.symbol, { symbol: i.symbol, target: prev?.target ?? i.targetPrice ?? undefined });
  }
  const watch = [...watchMap.values()];

  // Where the swings come from: 6 months of daily returns.
  const riskHoldings: RiskHolding[] = holdingsBase.filter((h) => data.daily[h.symbol]?.length).map((h) => ({ symbol: h.symbol, weight: h.weight, diversified: isDiversified(h.sector) }));
  const rets = alignedReturns([...riskHoldings.map((h) => h.symbol), "SPY"], data.daily, sessions, 126);
  const all = generateSignals({
    metrics,
    holdings: holdingCtx,
    sectorWeights,
    earnings: data.earnings,
    recs: data.recommendations,
    watchlist: watch,
    washSales: ws,
    taxLots: lots,
    cashWeight: total > 0 ? cash / total : 0,
    total,
    asOf: data.asOf,
    t,
    market: metrics.SPY,
    riskShares: riskShares(riskHoldings, rets),
    clusters: correlatedClusters(riskHoldings, rets, t.clusterCorr, rets.SPY),
    insiders: data.insiders,
    realized,
  });
  const isSuppressed = (s: Signal) => {
    if (s.symbol && suppression.mutes.has(s.symbol)) return true;
    const until = suppression.snoozes.get(s.id);
    return !!until && until >= data.asOf;
  };
  const signals = all.filter((s) => !isSuppressed(s));
  const groups = groupSignals(signals);
  const urgentCount = groups.filter((g) => g.severity === "warning" || g.severity === "caution").length;
  const suppressed = all.filter(isSuppressed);

  const tagsBySymbol = new Map<string, HoldingRow["tags"]>();
  for (const s of signals) {
    if (!s.symbol) continue;
    const list = tagsBySymbol.get(s.symbol) ?? [];
    if (!list.some((x) => x.tag === s.tag)) list.push({ tag: s.tag, severity: s.severity });
    tagsBySymbol.set(s.symbol, list);
  }
  const holdings: HoldingRow[] = holdingsBase.map((h) => ({ ...h, tags: tagsBySymbol.get(h.symbol) ?? [] }));

  // Account summaries.
  const accountSummaries: AccountSummary[] = accounts.map((a) => {
    const ps = positions.filter((p) => p.accountId === a.id);
    const value = a.cash + ps.reduce((s, p) => s + p.marketValue, 0);
    const dayChange = ps.reduce((s, p) => s + p.dayPL, 0);
    const h = perAccount[a.id];
    return {
      account: a,
      value,
      dayChange,
      dayPct: value - dayChange > 0 ? dayChange / (value - dayChange) : 0,
      share: total > 0 ? value / total : 0,
      spark: h.slice(-30).map((p) => p.value),
      positions: ps.length,
    };
  });

  // YTD.
  const ys = yearStart(data.asOf);
  let ytdFrom = history.findIndex((p) => p.date >= ys) - 1;
  if (ytdFrom < 0) ytdFrom = 0;
  const last = history.length - 1;
  const spyAt = (d: string) => close("SPY", d);
  const ytd = {
    twr: twrBetween(twr, ytdFrom, last),
    bench: history.length ? spyAt(history[last].date) / spyAt(history[ytdFrom].date) - 1 : 0,
    gain: history.length ? gainBetween(history, ytdFrom, last) : 0,
  };

  const fwdDividends = holdings.reduce((s, h) => s + h.quantity * (q(h.symbol)?.divAmount ?? 0), 0);
  const dividendsYtd = txns.filter((x) => x.kind === "DIVIDEND" && x.date >= ys).reduce((s, x) => s + x.netAmount, 0);

  return {
    data,
    scope,
    scopeLabel: scope === "all" ? "All accounts" : accounts[0]?.name ?? "Account",
    accounts,
    positions,
    txns,
    close,
    sessions,
    total,
    cash,
    invested,
    costBasis,
    unrealized: invested - costBasis,
    dayPL,
    dayPct,
    holdings,
    accountSummaries,
    metrics,
    history,
    twr,
    sectorWeights,
    signals,
    groups,
    urgentCount,
    suppressed,
    reviews,
    matches,
    openLots: open,
    scorecard: sc,
    washSales: ws,
    taxLots: lots,
    realized,
    ytd,
    fwdDividends,
    dividendsYtd,
    thresholds: t,
  };
}

// ─── Net-worth series per range ───────────────────────────────────────

export function netWorthSeries(m: PortfolioModel): RangeSeries[] {
  const { history, data, close } = m;
  const out: RangeSeries[] = [];
  if (history.length < 2) return out;
  const last = history.length - 1;
  const summarize = (key: RangeKey, points: SeriesPoint[], deposits: number[], gain: number, gainPct: number, benchPct?: number): RangeSeries => {
    const vs = points.map((p) => p.v);
    const b0 = points[0]?.b || 1;
    const bEnd = points.at(-1)?.b ?? b0;
    return { key, points, deposits, gain, gainPct, benchPct: benchPct ?? bEnd / b0 - 1, high: Math.max(...vs), low: Math.min(...vs) };
  };

  // Intraday ranges use five-minute bars and each day's end-of-day holdings.
  const intradayRange = (key: RangeKey, days: number, step: number) => {
    const dates = history.slice(-days).map((p) => p.date);
    const startPoint = history[history.length - days - 1] ?? history[0];
    const spyStart = close("SPY", startPoint.date);
    const pts: SeriesPoint[] = [];
    const spyIntra = data.intraday.SPY ?? [];
    for (const date of dates) {
      const day = history.find((p) => p.date === date)!;
      const syms = Object.keys(day.holdings);
      const bars = spyIntra.filter((b) => b.date === date);
      const series = new Map(syms.map((s) => [s, (data.intraday[s] ?? []).filter((b) => b.date === date)]));
      bars.forEach((spyBar, j) => {
        if (j % step !== step - 1 && j !== bars.length - 1) return;
        let v = day.cash;
        for (const s of syms) v += day.holdings[s] * (series.get(s)?.[j]?.close ?? close(s, date));
        const label = key === "1D" ? fmtTimeET(spyBar.t + 300_000) : `${dayName(date)} ${fmtTimeET(spyBar.t + 300_000)}`;
        pts.push({ t: spyBar.t + 300_000, label, v, b: spyBar.close });
      });
    }
    const first: SeriesPoint = {
      t: (pts[0]?.t ?? 0) - 300_000,
      label: key === "1D" ? "Prev close" : fmtDate(startPoint.date, "short"),
      v: startPoint.value,
      b: spyStart,
    };
    const points = [first, ...pts];
    const from = history.length - days - 1;
    const gain = gainBetween(history, Math.max(0, from), last);
    const gainPct = key === "1D" ? m.dayPct : twrBetween(m.twr, Math.max(0, from), last);
    // Normalize the S&P line to start at the portfolio's starting value.
    const k = first.v / first.b;
    return summarize(key, points.map((p) => ({ ...p, b: p.b * k })), [], gain, gainPct);
  };
  out.push(intradayRange("1D", 1, 1));
  out.push(intradayRange("1W", 5, 6));

  const dailyRange = (key: RangeKey, from: number) => {
    from = Math.max(0, Math.min(from, last - 1));
    const shadow = shadowSeries(history, from, "SPY", close);
    const points: SeriesPoint[] = [];
    const deposits: number[] = [];
    for (let i = from; i <= last; i++) {
      const p = history[i];
      // Mark meaningful deposits only, so routine contributions don't clutter long ranges.
      if (i > from && p.flow >= Math.max(2_500, p.value * 0.01)) deposits.push(i - from);
      points.push({ t: i, label: fmtDate(p.date, "medium"), v: p.value, b: shadow[i] });
    }
    const spyRet = close("SPY", history[last].date) / close("SPY", history[from].date) - 1;
    return summarize(key, points, deposits, gainBetween(history, from, last), twrBetween(m.twr, from, last), spyRet);
  };
  out.push(dailyRange("1M", last - 21));
  out.push(dailyRange("3M", last - 63));
  const ys = yearStart(data.asOf);
  out.push(dailyRange("YTD", history.findIndex((p) => p.date >= ys) - 1));
  out.push(dailyRange("1Y", last - 252));
  out.push(dailyRange("ALL", 0));
  return out;
}

// ─── Upcoming events ──────────────────────────────────────────────────

export interface UpcomingEvent {
  date: string;
  symbol: string;
  kind: "earnings" | "ex-dividend";
  title: string;
  detail: string;
  attention: boolean;
}

export function upcomingEvents(m: PortfolioModel, watchSymbols: string[], days = 14): UpcomingEvent[] {
  const { data } = m;
  const end = addDays(data.asOf, days);
  const held = new Map(m.holdings.map((h) => [h.symbol, h]));
  const watch = new Set(watchSymbols);
  const out: UpcomingEvent[] = [];
  for (const e of data.earnings) {
    if (e.date < data.asOf || e.date > end) continue;
    const h = held.get(e.symbol);
    if (!h && !watch.has(e.symbol)) continue;
    const when = e.hour === "amc" ? "After close" : e.hour === "bmo" ? "Before open" : "Time TBD";
    out.push({
      date: e.date,
      symbol: e.symbol,
      kind: "earnings",
      title: `${e.symbol} earnings`,
      detail: h ? `${when} · ${(h.weight * 100).toFixed(0)}% weight` : `${when} · Watchlist`,
      attention: !!h && diffDays(data.asOf, e.date) <= m.thresholds.earningsDays,
    });
  }
  for (const h of m.holdings) {
    const qt = data.quotes[h.symbol];
    if (!qt?.nextExDate || qt.nextExDate < data.asOf || qt.nextExDate > end) continue;
    const perShare = qt.divAmount / 4;
    out.push({
      date: qt.nextExDate,
      symbol: h.symbol,
      kind: "ex-dividend",
      title: `${h.symbol} ex-dividend`,
      detail: `$${perShare.toFixed(2)}/sh · about $${Math.round(perShare * h.quantity).toLocaleString()}`,
      attention: false,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
