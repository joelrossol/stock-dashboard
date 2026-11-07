/** Rule-based signals. Transparent and mechanical: signals, not advice. */
import { diffDays, fmtDate } from "@/lib/dates";
import { money, pct, pts } from "@/lib/format";
import type { EarningsEvent, RecTrend } from "@/lib/data/types";
import type { SymbolMetrics } from "./metrics";
import type { Thresholds } from "./thresholds";
import type { TaxLotView, WashSale } from "./trades";

export type Severity = "warning" | "caution" | "opportunity" | "info";

export type SignalType =
  | "losing-streak"
  | "downtrend"
  | "death-cross"
  | "below-200"
  | "underwater"
  | "laggard"
  | "abnormal-drop"
  | "earnings-soon"
  | "downgrade"
  | "concentration-stock"
  | "concentration-sector"
  | "buy-more"
  | "overheated"
  | "dip-in-uptrend"
  | "golden-cross"
  | "breakout"
  | "watchlist-target"
  | "idle-cash"
  | "wash-sale"
  | "lt-soon"
  | "harvest";

export interface Signal {
  id: string;
  type: SignalType;
  severity: Severity;
  symbol?: string;
  title: string;
  detail: string;
  tag: string;
  reasons: string[];
  metrics: { label: string; value: string }[];
  score: number;
}

export interface HoldingContext {
  symbol: string;
  weight: number;
  value: number;
  unrealizedPct: number;
  sector: string;
}

export interface SignalInput {
  metrics: Record<string, SymbolMetrics>;
  holdings: HoldingContext[];
  sectorWeights: { sector: string; weight: number; value: number }[];
  earnings: EarningsEvent[];
  recs: Record<string, RecTrend[]>;
  watchlist: { symbol: string; target?: number }[];
  washSales: WashSale[];
  taxLots: TaxLotView[];
  cashWeight: number;
  total: number;
  asOf: string;
  t: Thresholds;
}

export const SEVERITY_RANK: Record<Severity, number> = { warning: 0, caution: 1, opportunity: 2, info: 3 };

export const TYPE_LABEL: Record<SignalType, string> = {
  "losing-streak": "Losing streak",
  downtrend: "Steady downtrend",
  "death-cross": "Death cross",
  "below-200": "Below 200-day",
  underwater: "Underwater",
  laggard: "Laggard",
  "abnormal-drop": "Abnormal drop",
  "earnings-soon": "Earnings soon",
  downgrade: "Analyst downgrade",
  "concentration-stock": "Concentration",
  "concentration-sector": "Sector concentration",
  "buy-more": "Buy signal",
  overheated: "Stretched",
  "dip-in-uptrend": "Dip in uptrend",
  "golden-cross": "Golden cross",
  breakout: "Breakout",
  "watchlist-target": "Target hit",
  "idle-cash": "Idle cash",
  "wash-sale": "Wash sale",
  "lt-soon": "Long-term soon",
  harvest: "Harvest candidate",
};

const consensus = (r: RecTrend) => {
  const n = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
  return n ? (2 * r.strongBuy + r.buy - r.sell - 2 * r.strongSell) / n : 0;
};

const f2 = (x: number | null | undefined, d = 0) => (x == null ? "—" : x.toFixed(d));

export function generateSignals(input: SignalInput): Signal[] {
  const { metrics, holdings, t, asOf } = input;
  const out: Signal[] = [];
  const add = (s: Omit<Signal, "id" | "tag"> & { tag?: string }) =>
    out.push({ ...s, id: `${s.type}:${s.symbol ?? "portfolio"}`, tag: s.tag ?? TYPE_LABEL[s.type] });

  const nextEarnings = new Map<string, EarningsEvent>();
  for (const e of [...input.earnings].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.date >= asOf && !nextEarnings.has(e.symbol)) nextEarnings.set(e.symbol, e);
  }
  const daysToEarnings = (s: string) => {
    const e = nextEarnings.get(s);
    return e ? diffDays(asOf, e.date) : Infinity;
  };

  for (const h of holdings) {
    const m = metrics[h.symbol];
    if (!m) continue;
    const s = h.symbol;
    const common = [
      { label: "Weight", value: pct(h.weight, { digits: 1, sign: false }) },
      { label: "RSI", value: f2(m.rsi14) },
    ];

    // Warnings ────────────────────────────────────────────────────────
    const streak = m.consecDown >= t.losingStreakDays;
    const weekDrop = (m.ret5d ?? 0) <= t.fiveDayDrop;
    if (streak || weekDrop) {
      add({
        type: "losing-streak",
        severity: "warning",
        symbol: s,
        title: streak ? `${s} down ${m.consecDown} days straight` : `${s} down ${pct(m.ret5d ?? 0, { digits: 1 })} this week`,
        detail: `${pct(m.ret5d ?? 0, { digits: 1 })} this week${m.sma50 && m.last < m.sma50 ? " · below 50-day avg" : ""}`,
        reasons: [
          streak ? `${m.consecDown} consecutive down closes (rule: ${t.losingStreakDays}+)` : `5-day return ${pct(m.ret5d ?? 0)} (rule: ${pct(t.fiveDayDrop, { digits: 0 })} or worse)`,
          `${Math.round(m.down10 * 10)} of the last 10 sessions closed lower`,
        ],
        metrics: [{ label: "5-day", value: pct(m.ret5d ?? 0, { digits: 1 }) }, { label: "Streak", value: `${m.consecDown}d` }, ...common],
        score: 3 + m.consecDown / 2 + Math.abs(m.ret5d ?? 0) * 20,
      });
    }

    if (m.trend20 && m.trend20.slopePerDay < 0 && m.trend20.r2 >= t.downtrendR2 && m.sma50 && m.last < m.sma50) {
      add({
        type: "downtrend",
        severity: "warning",
        symbol: s,
        title: `${s} in a steady downtrend`,
        detail: `${pct(m.ret1m ?? 0, { digits: 1 })} in a month · consistency ${m.trend20.r2.toFixed(2)}`,
        reasons: [`20-day trend is negative with R² ${m.trend20.r2.toFixed(2)} (rule: > ${t.downtrendR2})`, "Price is below its 50-day average"],
        metrics: [{ label: "1M", value: pct(m.ret1m ?? 0, { digits: 1 }) }, { label: "R²", value: m.trend20.r2.toFixed(2) }, ...common],
        score: 2 + m.trend20.r2,
      });
    }

    if (m.cross?.kind === "death") {
      add({
        type: "death-cross",
        severity: "warning",
        symbol: s,
        title: `${s} death cross`,
        detail: `50-day fell below 200-day ${m.cross.daysAgo === 0 ? "today" : `${m.cross.daysAgo} sessions ago`}`,
        reasons: ["The 50-day average crossed below the 200-day average, a classic long-term trend break"],
        metrics: [{ label: "50-day", value: f2(m.sma50, 2) }, { label: "200-day", value: f2(m.sma200, 2) }, ...common],
        score: 2.5,
      });
    } else if (m.sma200 && m.freshBelow200 != null) {
      add({
        type: "below-200",
        severity: "caution",
        symbol: s,
        title: `${s} broke below its 200-day average`,
        detail: `${m.freshBelow200 === 0 ? "Today" : `${m.freshBelow200} sessions ago`} · ${pct(m.last / m.sma200 - 1, { digits: 1 })} vs 200-day`,
        reasons: ["Price closed below the 200-day moving average, a common long-term trend line"],
        metrics: [{ label: "vs 200-day", value: pct(m.last / m.sma200 - 1, { digits: 1 }) }, ...common],
        score: 1 + Math.abs(m.last / m.sma200 - 1) * 5,
      });
    }

    if (h.unrealizedPct <= t.underwaterCaution) {
      const severe = h.unrealizedPct <= t.underwaterWarning;
      add({
        type: "underwater",
        severity: severe ? "warning" : "caution",
        symbol: s,
        title: `${s} is ${pct(-h.unrealizedPct, { digits: 0, sign: false })} below your cost`,
        detail: `Unrealized ${pct(h.unrealizedPct, { digits: 1 })} · review your thesis`,
        reasons: [`Down ${pct(h.unrealizedPct, { digits: 1 })} from your average cost (rule: ${pct(severe ? t.underwaterWarning : t.underwaterCaution, { digits: 0 })})`],
        metrics: [{ label: "Unrealized", value: pct(h.unrealizedPct, { digits: 1 }) }, ...common],
        score: 1.5 + Math.abs(h.unrealizedPct) * 4,
      });
    }

    if (m.rs3m != null && m.rs3m <= -t.laggardGap && (m.ret3m ?? 0) < 0) {
      add({
        type: "laggard",
        severity: "caution",
        symbol: s,
        title: `${s} falling while the S&P rises`,
        detail: `${pts(m.rs3m)} vs S&P over 3 months`,
        reasons: [`3-month return ${pct(m.ret3m ?? 0, { digits: 1 })} vs S&P ${pct((m.ret3m ?? 0) - m.rs3m, { digits: 1 })} (rule: ${pts(-t.laggardGap, 0)})`],
        metrics: [{ label: "3M", value: pct(m.ret3m ?? 0, { digits: 1 }) }, { label: "vs S&P", value: pts(m.rs3m) }, ...common],
        score: 1 + Math.abs(m.rs3m) * 3,
      });
    }

    if (m.moveZ != null && m.moveZ <= t.abnormalZ) {
      add({
        type: "abnormal-drop",
        severity: "warning",
        symbol: s,
        title: `${s} unusual drop today`,
        detail: `${pct(m.ret1d, { digits: 1 })} is ${Math.abs(m.moveZ).toFixed(1)}× its normal daily move${m.volRatio && m.volRatio > 1.4 ? ` · volume ${m.volRatio.toFixed(1)}×` : ""}`,
        reasons: [`Move z-score ${m.moveZ.toFixed(1)} (rule: ${t.abnormalZ} or lower)`, m.volRatio ? `Volume ${m.volRatio.toFixed(1)}× its 20-day average` : ""].filter(Boolean),
        metrics: [{ label: "Today", value: pct(m.ret1d, { digits: 1 }) }, { label: "z-score", value: m.moveZ.toFixed(1) }, { label: "Volume", value: `${f2(m.volRatio, 1)}×` }],
        score: 3 + Math.abs(m.moveZ) / 2,
      });
    }

    const dte = daysToEarnings(s);
    if (dte <= t.earningsDays) {
      const e = nextEarnings.get(s)!;
      add({
        type: "earnings-soon",
        severity: "caution",
        symbol: s,
        tag: "Earnings",
        title: `${s} reports ${dte === 0 ? "today" : dte === 1 ? "tomorrow" : `in ${dte} days`}`,
        detail: `${pct(h.weight, { digits: 0, sign: false })} of your portfolio exposed · ${e.hour === "amc" ? "after close" : e.hour === "bmo" ? "before open" : fmtDate(e.date, "short")}`,
        reasons: [`Earnings on ${fmtDate(e.date, "long")}`, `Position is ${money(h.value)} (${pct(h.weight, { digits: 1, sign: false })} of portfolio)`],
        metrics: [{ label: "Date", value: fmtDate(e.date, "short") }, { label: "Exposure", value: money(h.value, { compact: true }) }, ...common],
        score: 2 + h.weight * 10,
      });
    }

    const recs = input.recs[s];
    if (recs && recs.length >= 2) {
      const drop = consensus(recs[0]) - consensus(recs[1]);
      if (drop <= -t.downgradeDrop) {
        add({
          type: "downgrade",
          severity: "caution",
          symbol: s,
          title: `Analysts cooling on ${s}`,
          detail: `Buy ratings ${recs[1].strongBuy + recs[1].buy} → ${recs[0].strongBuy + recs[0].buy} this month`,
          reasons: [`Consensus score fell ${Math.abs(drop).toFixed(2)} month over month (rule: ${t.downgradeDrop})`, `Sell ratings ${recs[1].sell + recs[1].strongSell} → ${recs[0].sell + recs[0].strongSell}`],
          metrics: [{ label: "Buy", value: String(recs[0].strongBuy + recs[0].buy) }, { label: "Hold", value: String(recs[0].hold) }, { label: "Sell", value: String(recs[0].sell + recs[0].strongSell) }],
          score: 1.5 + Math.abs(drop),
        });
      }
    }

    // Broad-market funds are diversified by design, so the single-stock cap doesn't apply.
    const overCap = h.sector !== "Broad market" && h.weight > t.stockCap;
    if (overCap) {
      add({
        type: "concentration-stock",
        severity: "caution",
        symbol: s,
        tag: "Risk",
        title: `${s} is ${pct(h.weight, { digits: 0, sign: false })} of your portfolio`,
        detail: `Above your ${pct(t.stockCap, { digits: 0, sign: false })} single-stock cap · buy signals paused`,
        reasons: [`Position ${money(h.value)} of ${money(input.total)} total`, "Buy-more signals stay off while a position is over the cap"],
        metrics: [{ label: "Weight", value: pct(h.weight, { digits: 1, sign: false }) }, { label: "Cap", value: pct(t.stockCap, { digits: 0, sign: false }) }],
        score: 2 + (h.weight - t.stockCap) * 10,
      });
    }

    // Opportunities ─────────────────────────────────────────────────────
    const r = m.rsi14 ?? 50;
    const steady = (m.trend60?.r2 ?? 0) >= t.buyMinR2;
    if (m.trendScore >= t.buyTrendScore) {
      if (r >= t.buyMaxRsi) {
        add({
          type: "overheated",
          severity: "info",
          symbol: s,
          title: `${s} strong but stretched`,
          detail: `Trend score ${m.trendScore} · RSI ${r.toFixed(0)} is overbought`,
          reasons: [`Trend score ${m.trendScore} qualifies, but RSI ${r.toFixed(0)} ≥ ${t.buyMaxRsi}, so no buy signal`],
          metrics: [{ label: "Trend", value: String(m.trendScore) }, ...common],
          score: 1,
        });
      } else if (steady && !overCap && dte > t.buyEarningsBuffer) {
        add({
          type: "buy-more",
          severity: "opportunity",
          symbol: s,
          tag: "Buy signal",
          title: `${s} in a steady uptrend`,
          detail: `${pct(m.ret3m ?? 0, { digits: 0 })} in 3M · consistency ${(m.trend60?.r2 ?? 0).toFixed(2)} · ${pct(h.weight, { digits: 0, sign: false })} weight`,
          reasons: [
            `Trend score ${m.trendScore} (rule: ≥ ${t.buyTrendScore}) with 60-day consistency ${(m.trend60?.r2 ?? 0).toFixed(2)} (rule: ≥ ${t.buyMinR2})`,
            `RSI ${r.toFixed(0)} is below ${t.buyMaxRsi}, so it isn't overheated`,
            `Weight ${pct(h.weight, { digits: 1, sign: false })} is under the ${pct(t.stockCap, { digits: 0, sign: false })} cap`,
            Number.isFinite(dte) ? `Next earnings in ${dte} days` : "No earnings scheduled soon",
          ],
          metrics: [{ label: "Trend", value: String(m.trendScore) }, { label: "R² (60d)", value: (m.trend60?.r2 ?? 0).toFixed(2) }, ...common],
          score: 2 + m.trendScore / 50,
        });
      }
    }

    const inUptrend = m.sma200 != null && m.last > m.sma200 && (m.trend60?.slopePerDay ?? 0) > 0;
    const dipSize = -m.offHigh20;
    if (inUptrend && ((dipSize >= t.dipMin && dipSize <= t.dipMax) || r < t.dipRsi) && !overCap) {
      add({
        type: "dip-in-uptrend",
        severity: "opportunity",
        symbol: s,
        title: `${s} pulled back in an uptrend`,
        detail: `${pct(m.offHigh20, { digits: 1 })} from its 20-day high · still above 200-day`,
        reasons: [`Long-term uptrend: above the 200-day average with a rising 60-day trend`, `Off ${pct(dipSize, { digits: 1, sign: false })} from the recent high (rule: ${pct(t.dipMin, { digits: 0, sign: false })}–${pct(t.dipMax, { digits: 0, sign: false })})`],
        metrics: [{ label: "From high", value: pct(m.offHigh20, { digits: 1 }) }, ...common],
        score: 1.5 + dipSize * 5,
      });
    }

    if (m.cross?.kind === "golden") {
      add({
        type: "golden-cross",
        severity: "opportunity",
        symbol: s,
        title: `${s} golden cross`,
        detail: `50-day rose above 200-day ${m.cross.daysAgo === 0 ? "today" : `${m.cross.daysAgo} sessions ago`}`,
        reasons: ["The 50-day average crossed above the 200-day average, a classic long-term trend turn"],
        metrics: [{ label: "50-day", value: f2(m.sma50, 2) }, { label: "200-day", value: f2(m.sma200, 2) }, ...common],
        score: 1.8,
      });
    }

    if (m.newHigh52 && (m.volRatio ?? 0) >= t.breakoutVolume) {
      add({
        type: "breakout",
        severity: "opportunity",
        symbol: s,
        title: `${s} broke out to a 52-week high`,
        detail: `New high on ${f2(m.volRatio, 1)}× normal volume`,
        reasons: ["Closed at a new 52-week high", `Volume ${f2(m.volRatio, 1)}× its 20-day average (rule: ${t.breakoutVolume}×)`],
        metrics: [{ label: "Volume", value: `${f2(m.volRatio, 1)}×` }, ...common],
        score: 2,
      });
    }
  }

  // Watchlist ──────────────────────────────────────────────────────────
  for (const w of input.watchlist) {
    const m = metrics[w.symbol];
    if (!m || !w.target || m.last > w.target) continue;
    add({
      type: "watchlist-target",
      severity: "opportunity",
      symbol: w.symbol,
      tag: "Target hit",
      title: `${w.symbol} hit your target`,
      detail: `${m.last.toFixed(2)} vs target ${w.target.toFixed(2)} · trend ${m.trendLabel.toLowerCase()}`,
      reasons: [`Price ${m.last.toFixed(2)} is at or below your ${w.target.toFixed(2)} target`, `Trend score ${m.trendScore} (${m.trendLabel})`],
      metrics: [{ label: "Price", value: m.last.toFixed(2) }, { label: "Target", value: w.target.toFixed(2) }, { label: "RSI", value: f2(m.rsi14) }],
      score: 2.2,
    });
  }

  // Portfolio ──────────────────────────────────────────────────────────
  for (const sw of input.sectorWeights) {
    if (sw.sector === "Broad market" || sw.sector === "Unclassified" || sw.weight <= t.sectorCap) continue;
    add({
      type: "concentration-sector",
      severity: "caution",
      tag: "Risk",
      title: `${sw.sector} is ${pct(sw.weight, { digits: 0, sign: false })} of your portfolio`,
      detail: `Above your ${pct(t.sectorCap, { digits: 0, sign: false })} sector cap`,
      reasons: [`${money(sw.value)} in ${sw.sector}`, "Broad-market ETFs are excluded from sector caps"],
      metrics: [{ label: "Weight", value: pct(sw.weight, { digits: 1, sign: false }) }, { label: "Cap", value: pct(t.sectorCap, { digits: 0, sign: false }) }],
      score: 2 + (sw.weight - t.sectorCap) * 8,
    });
  }

  if (input.cashWeight > t.idleCash) {
    add({
      type: "idle-cash",
      severity: "info",
      title: `${pct(input.cashWeight, { digits: 0, sign: false })} of your portfolio is cash`,
      detail: `Above your ${pct(t.idleCash, { digits: 0, sign: false })} idle-cash threshold`,
      reasons: ["Uninvested cash can drag on long-run returns"],
      metrics: [{ label: "Cash", value: pct(input.cashWeight, { digits: 1, sign: false }) }],
      score: 1,
    });
  }

  // Tax ────────────────────────────────────────────────────────────────
  for (const w of input.washSales) {
    add({
      type: "wash-sale",
      severity: "caution",
      symbol: w.symbol,
      title: `${w.symbol} wash sale`,
      detail: `${money(w.loss)} loss on ${fmtDate(w.sellDate, "short")} may be disallowed`,
      reasons: [
        `Sold at a loss in a taxable account on ${fmtDate(w.sellDate)}`,
        ...w.buys.map((b) => `Bought ${b.qty} ${w.symbol} on ${fmtDate(b.date)} (within 30 days, any account counts, IRAs included)`),
      ],
      metrics: [{ label: "Loss", value: money(w.loss) }, { label: "Buys", value: String(w.buys.length) }],
      score: 2,
    });
  }

  const soon = input.taxLots.filter((l) => l.daysToLongTerm > 0 && l.daysToLongTerm <= t.ltWindowDays && l.unrealized > 0);
  for (const l of soon) {
    add({
      type: "lt-soon",
      severity: "info",
      symbol: l.symbol,
      title: `${l.symbol} lot turns long-term in ${l.daysToLongTerm} days`,
      detail: `${l.qty} shares · ${money(l.unrealized, { sign: true })} gain · waiting lowers the tax rate`,
      reasons: [`Bought ${fmtDate(l.date)}; long-term from ${fmtDate(l.longTermDate)}`],
      metrics: [{ label: "Gain", value: money(l.unrealized, { sign: true }) }, { label: "Days", value: String(l.daysToLongTerm) }],
      score: 1.2,
    });
  }

  const losses = new Map<string, number>();
  for (const l of input.taxLots) if (l.unrealized < 0) losses.set(l.symbol, (losses.get(l.symbol) ?? 0) + l.unrealized);
  const candidates = [...losses.entries()].filter(([, loss]) => loss <= -t.harvestMin).sort((a, b) => a[1] - b[1]);
  if (candidates.length) {
    const totalLoss = candidates.reduce((sum, [, l]) => sum + l, 0);
    const blocked = new Set(input.washSales.map((w) => w.symbol));
    add({
      type: "harvest",
      severity: "info",
      title: `${candidates.length} tax-loss harvest candidate${candidates.length > 1 ? "s" : ""}`,
      detail: `${money(totalLoss)} in unrealized losses · ${candidates.map(([sym]) => sym).slice(0, 4).join(", ")}`,
      reasons: candidates.map(([sym, loss]) => `${sym}: ${money(loss)} in taxable lots${blocked.has(sym) ? " (wash-sale window still open)" : ""}`),
      metrics: [{ label: "Losses", value: money(totalLoss) }, { label: "Symbols", value: String(candidates.length) }],
      score: 1.1,
    });
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.score - a.score);
}

export interface InsightGroup {
  key: string;
  symbol?: string;
  severity: Severity;
  primary: Signal;
  related: Signal[];
}

/** One card per symbol: the most important signal leads, the rest come along. */
export function groupSignals(signals: Signal[]): InsightGroup[] {
  const groups = new Map<string, InsightGroup>();
  for (const s of signals) {
    const key = s.symbol ?? s.id;
    const g = groups.get(key);
    if (g) g.related.push(s);
    else groups.set(key, { key, symbol: s.symbol, severity: s.severity, primary: s, related: [] });
  }
  return [...groups.values()];
}
