/** Rule-based signals. Transparent and mechanical: signals, not advice. */
import { isDiversified } from "@/lib/data/classify";
import { addDays, diffDays, fmtDate } from "@/lib/dates";
import { money, pct, pts } from "@/lib/format";
import type { EarningsEvent, InsiderTxn, RecTrend } from "@/lib/data/types";
import { REFERENCE_VOL, type SymbolMetrics } from "./metrics";
import type { Cluster, RiskShare } from "./portfolioRisk";
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
  | "harvest"
  | "market-regime"
  | "trailing-stop"
  | "risk-share"
  | "cluster"
  | "gap"
  | "upgrade"
  | "extended"
  | "insider-buying"
  | "ex-dividend";

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
  quantity?: number;
  avgCost?: number;
  /** Highest close since you bought (or within the last year, if the buy is older than the history). */
  peak?: { price: number; date: string; since: string };
  nextExDate?: string;
  divPerShare?: number; // annual
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
  /** S&P 500 metrics, for the market check. */
  market?: SymbolMetrics;
  riskShares?: RiskShare[];
  clusters?: Cluster[];
  insiders?: Record<string, InsiderTxn[]>;
  realized?: { taxableShort: number; taxableLong: number };
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
  "market-regime": "Market check",
  "trailing-stop": "Off your high",
  "risk-share": "Risk share",
  cluster: "Moves together",
  gap: "Gap",
  upgrade: "Analyst upgrade",
  extended: "Extended",
  "insider-buying": "Insider buying",
  "ex-dividend": "Ex-dividend",
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

  const sorted = [...input.earnings].sort((a, b) => a.date.localeCompare(b.date));
  const nextEarnings = new Map<string, EarningsEvent>();
  for (const e of sorted) if (e.date >= asOf && !nextEarnings.has(e.symbol)) nextEarnings.set(e.symbol, e);
  const daysToEarnings = (s: string) => {
    const e = nextEarnings.get(s);
    return e ? diffDays(asOf, e.date) : Infinity;
  };
  // A report the market has already reacted to: within the last 4 days, or this morning.
  const recentReport = new Map<string, EarningsEvent>();
  for (const e of sorted) {
    const ago = diffDays(e.date, asOf);
    if (ago >= 0 && ago <= 4 && !(ago === 0 && e.hour !== "bmo")) recentReport.set(e.symbol, e);
  }

  // Market check ────────────────────────────────────────────────────────
  const mk = input.market;
  const below200 = !!mk?.sma200 && mk.last < mk.sma200;
  const stressed = !!mk && mk.vol20 >= t.regimeVol;
  const riskOff = below200 || stressed;
  const riskOffNote = below200 ? "The S&P 500 is below its 200-day average" : "The S&P 500 is unusually volatile";
  if (mk && riskOff) {
    add({
      type: "market-regime",
      severity: "caution",
      tag: "Market",
      title: below200 ? "The S&P 500 is below its 200-day average" : "The market is unusually volatile",
      detail: `${below200 && mk.sma200 ? `${pct(mk.last / mk.sma200 - 1, { digits: 1 })} vs 200-day · ` : ""}volatility ${pct(mk.vol20, { digits: 0, sign: false })} · buy signals shown as info`,
      reasons: [
        below200 && mk.sma200 ? `S&P ${mk.last.toFixed(2)} vs 200-day ${mk.sma200.toFixed(2)}` : `S&P is above its 200-day average`,
        `20-day volatility ${pct(mk.vol20, { digits: 0, sign: false })} (stressed at ${pct(t.regimeVol, { digits: 0, sign: false })}+; long-run average about ${pct(REFERENCE_VOL, { digits: 0, sign: false })})`,
        "Dip-buys and breakouts fail more often in falling or stressed markets, so buy signals drop to info until this clears",
      ],
      metrics: [
        { label: "vs 200-day", value: mk.sma200 ? pct(mk.last / mk.sma200 - 1, { digits: 1 }) : "—" },
        { label: "Volatility", value: pct(mk.vol20, { digits: 0, sign: false }) },
        { label: "1M", value: pct(mk.ret1m ?? 0, { digits: 1 }) },
      ],
      score: 3,
    });
  }
  const buySeverity: Severity = riskOff ? "info" : "opportunity";
  const marketReason = riskOff ? [`${riskOffNote}, so this is shown as info`] : [];

  const scaledNote = (m: SymbolMetrics) =>
    Math.abs(m.volScale - 1) < 0.05 ? "" : ` · scaled ${m.volScale.toFixed(1)}× for ${m.symbol}'s volatility`;

  /** Buy-side rules, shared by holdings and watchlist names. */
  const opportunities = (s: string, m: SymbolMetrics, ctx: { weight: number; overCap: boolean; watch: boolean; common: Signal["metrics"] }) => {
    const r = m.rsi14 ?? 50;
    const dte = daysToEarnings(s);
    const on = ctx.watch ? " on your watchlist" : "";
    const tag = (label: string) => (ctx.watch ? `Watchlist · ${label}` : label);
    const steady = (m.trend60?.r2 ?? 0) >= t.buyMinR2;
    if (m.trendScore >= t.buyTrendScore) {
      if (r >= t.buyMaxRsi) {
        if (!ctx.watch)
          add({
            type: "overheated",
            severity: "info",
            symbol: s,
            title: `${s} strong but stretched`,
            detail: `Trend score ${m.trendScore} · RSI ${r.toFixed(0)} is overbought`,
            reasons: [`Trend score ${m.trendScore} qualifies, but RSI ${r.toFixed(0)} ≥ ${t.buyMaxRsi}, so no buy signal`],
            metrics: [{ label: "Trend", value: String(m.trendScore) }, ...ctx.common],
            score: 1,
          });
      } else if (steady && !ctx.overCap && dte > t.buyEarningsBuffer) {
        add({
          type: "buy-more",
          severity: buySeverity,
          symbol: s,
          tag: tag("Buy signal"),
          title: `${s} in a steady uptrend${on}`,
          detail: `${pct(m.ret3m ?? 0, { digits: 0 })} in 3M · consistency ${(m.trend60?.r2 ?? 0).toFixed(2)}${ctx.watch ? "" : ` · ${pct(ctx.weight, { digits: 0, sign: false })} weight`}`,
          reasons: [
            `Trend score ${m.trendScore} (rule: ≥ ${t.buyTrendScore}) with 60-day consistency ${(m.trend60?.r2 ?? 0).toFixed(2)} (rule: ≥ ${t.buyMinR2})`,
            `RSI ${r.toFixed(0)} is below ${t.buyMaxRsi}, so it isn't overheated`,
            ...(ctx.watch ? [] : [`Weight ${pct(ctx.weight, { digits: 1, sign: false })} is under the ${pct(t.stockCap, { digits: 0, sign: false })} cap`]),
            Number.isFinite(dte) ? `Next earnings in ${dte} days` : "No earnings scheduled soon",
            ...marketReason,
          ],
          metrics: [{ label: "Trend", value: String(m.trendScore) }, { label: "R² (60d)", value: (m.trend60?.r2 ?? 0).toFixed(2) }, ...ctx.common],
          score: 2 + m.trendScore / 50,
        });
      }
    }

    const inUptrend = m.sma200 != null && m.last > m.sma200 && (m.trend60?.slopePerDay ?? 0) > 0;
    const dipSize = -m.offHigh20;
    const dipMin = t.dipMin * m.volScale;
    const dipMax = t.dipMax * m.volScale;
    if (inUptrend && ((dipSize >= dipMin && dipSize <= dipMax) || r < t.dipRsi) && !ctx.overCap) {
      // Has it stopped falling? A higher close than yesterday, or back above the 20-day average.
      const turning = m.ret1d > 0 || (m.sma20 != null && m.last > m.sma20);
      add({
        type: "dip-in-uptrend",
        severity: buySeverity,
        symbol: s,
        tag: tag("Dip in uptrend"),
        title: `${s} pulled back in an uptrend${on}`,
        detail: `${pct(m.offHigh20, { digits: 1 })} from its 20-day high · ${turning ? "bouncing" : "still falling"} · above 200-day`,
        reasons: [
          `Long-term uptrend: above the 200-day average with a rising 60-day trend`,
          dipSize >= dipMin && dipSize <= dipMax
            ? `Off ${pct(dipSize, { digits: 1, sign: false })} from the recent high (rule: ${pct(dipMin, { digits: 0, sign: false })}–${pct(dipMax, { digits: 0, sign: false })}${scaledNote(m)})`
            : `RSI ${r.toFixed(0)} is below ${t.dipRsi}`,
          turning ? `Closed higher today (${pct(m.ret1d, { digits: 1 })}), a first sign the pullback is pausing` : `Still falling today (${pct(m.ret1d, { digits: 1 })}); waiting for a higher close is the more cautious entry`,
          ...marketReason,
        ],
        metrics: [{ label: "From high", value: pct(m.offHigh20, { digits: 1 }) }, ...ctx.common],
        score: 1.5 + dipSize * 5 + (turning ? 0.3 : 0),
      });
    }

    if (m.cross?.kind === "golden") {
      add({
        type: "golden-cross",
        severity: "info",
        symbol: s,
        tag: tag("Golden cross"),
        title: `${s} golden cross${on}`,
        detail: `50-day rose above 200-day ${m.cross.daysAgo === 0 ? "today" : `${m.cross.daysAgo} sessions ago`}`,
        reasons: ["The 50-day average crossed above the 200-day average, a long-term trend turn", "Crossovers lag: much of the move has usually happened by the time they print"],
        metrics: [{ label: "50-day", value: f2(m.sma50, 2) }, { label: "200-day", value: f2(m.sma200, 2) }, ...ctx.common],
        score: 1.3,
      });
    }

    if (m.newHigh52 && (m.volRatio ?? 0) >= t.breakoutVolume) {
      add({
        type: "breakout",
        severity: buySeverity,
        symbol: s,
        tag: tag("Breakout"),
        title: `${s} broke out to a 52-week high${on}`,
        detail: `New high on ${f2(m.volRatio, 1)}× normal volume`,
        reasons: [
          "At a new 52-week high",
          `Volume ${f2(m.volRatio, 1)}× its 20-day average, projected to a full day if the session is still open (rule: ${t.breakoutVolume}×)`,
          ...marketReason,
        ],
        metrics: [{ label: "Volume", value: `${f2(m.volRatio, 1)}×` }, ...ctx.common],
        score: 2,
      });
    }
  };

  /** Opening gaps, held or watched. Earnings gaps tend to keep drifting the same way for weeks. */
  const gapSignal = (s: string, m: SymbolMetrics, held: boolean) => {
    if (m.gap == null || m.gapZ == null || Math.abs(m.gapZ) < t.gapZ) return;
    const up = m.gap > 0;
    const report = recentReport.get(s);
    const open = (m.last / (1 + m.ret1d)) * (1 + m.gap);
    const holding = up ? m.last >= open : m.last <= open;
    const severity: Severity = up ? (report ? buySeverity : "info") : held ? (report ? "warning" : "caution") : "info";
    add({
      type: "gap",
      severity,
      symbol: s,
      tag: report ? "Earnings gap" : up ? "Gap up" : "Gap down",
      title: `${s} ${up ? "jumped" : "dropped"} ${pct(Math.abs(m.gap), { digits: 1, sign: false })} at the open${report ? " after earnings" : ""}${held ? "" : " (watchlist)"}`,
      detail: `${Math.abs(m.gapZ).toFixed(1)}× a normal day's move · ${holding ? (up ? "holding the gap" : "no bounce yet") : up ? "fading from the open" : "recovering from the open"} · ${pct(m.ret1d, { digits: 1 })} on the day`,
      reasons: [
        `Opened ${pct(m.gap, { digits: 1 })} from yesterday's close, ${Math.abs(m.gapZ).toFixed(1)}× its normal daily move (rule: ${t.gapZ}×)`,
        report ? `Reported earnings ${fmtDate(report.date, "short")}${report.hour === "amc" ? " after the close" : report.hour === "bmo" ? " before the open" : ""}` : "No earnings report on file; check the news",
        m.volRatio ? `Volume ${m.volRatio.toFixed(1)}× normal` : "",
        report ? `Large earnings gaps often keep drifting in the same direction for weeks (post-earnings drift)` : "",
        ...(up && report ? marketReason : []),
      ].filter(Boolean),
      metrics: [{ label: "Gap", value: pct(m.gap, { digits: 1 }) }, { label: "Day", value: pct(m.ret1d, { digits: 1 }) }, { label: "Volume", value: `${f2(m.volRatio, 1)}×` }],
      score: 2.5 + Math.abs(m.gapZ) / 2,
    });
  };

  /** Several insiders buying on the open market is one of the better-documented signals. */
  const insiderSignal = (s: string, watch: boolean) => {
    const buys = (input.insiders?.[s] ?? []).filter((x) => x.code === "P" && x.shares > 0 && diffDays(x.date, asOf) <= 90);
    const people = new Set(buys.map((b) => b.name));
    if (people.size < t.insiderMin) return;
    const dollars = buys.reduce((sum, b) => sum + b.shares * b.price, 0);
    const latest = buys.map((b) => b.date).sort().at(-1)!;
    add({
      type: "insider-buying",
      severity: buySeverity,
      symbol: s,
      tag: watch ? "Watchlist · Insiders" : "Insider buying",
      title: `${people.size} ${s} insiders bought shares${watch ? " (watchlist)" : ""}`,
      detail: `${money(dollars, { compact: true })} on the open market in 90 days · latest ${fmtDate(latest, "short")}`,
      reasons: [
        `${people.size} different insiders made open-market purchases (rule: ${t.insiderMin}+)`,
        ...[...people].slice(0, 4).map((name) => {
          const mine = buys.filter((b) => b.name === name);
          return `${name}: ${mine.reduce((n, b) => n + b.shares, 0).toLocaleString()} shares`;
        }),
        "Open-market purchases say more than sales, which often happen for personal reasons like taxes or diversification",
        ...marketReason,
      ],
      metrics: [{ label: "Insiders", value: String(people.size) }, { label: "Bought", value: money(dollars, { compact: true }) }],
      score: 1.8 + people.size * 0.2,
    });
  };

  for (const h of holdings) {
    const m = metrics[h.symbol];
    if (!m) continue;
    const s = h.symbol;
    const common = [
      { label: "Weight", value: pct(h.weight, { digits: 1, sign: false }) },
      { label: "RSI", value: f2(m.rsi14) },
    ];
    // Broad index and bond funds track the market by design: the market check covers them,
    // and per-fund trend alerts would repeat it for every fund you hold.
    const fund = isDiversified(h.sector);
    const overCap = !fund && h.weight > t.stockCap;
    const dte = daysToEarnings(s);

    if (!fund) {
      // Warnings ──────────────────────────────────────────────────────
      const weekRule = t.fiveDayDrop * m.volScale;
      const streak = m.consecDown >= t.losingStreakDays;
      const weekDrop = (m.ret5d ?? 0) <= weekRule;
      if (streak || weekDrop) {
        add({
          type: "losing-streak",
          severity: "warning",
          symbol: s,
          title: streak ? `${s} down ${m.consecDown} days straight` : `${s} down ${pct(m.ret5d ?? 0, { digits: 1 })} this week`,
          detail: `${pct(m.ret5d ?? 0, { digits: 1 })} this week${m.sma50 && m.last < m.sma50 ? " · below 50-day avg" : ""}`,
          reasons: [
            streak
              ? `${m.consecDown} consecutive down closes (rule: ${t.losingStreakDays}+)`
              : `5-day return ${pct(m.ret5d ?? 0)} (rule: ${pct(weekRule, { digits: 1 })} or worse${scaledNote(m)})`,
            `${Math.round(m.down10 * 10)} of the last 10 sessions closed lower`,
          ],
          metrics: [{ label: "5-day", value: pct(m.ret5d ?? 0, { digits: 1 }) }, { label: "Streak", value: `${m.consecDown}d` }, ...common],
          score: 3 + m.consecDown / 2 + Math.abs((m.ret5d ?? 0) / m.volScale) * 20,
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
          severity: "info",
          symbol: s,
          title: `${s} death cross`,
          detail: `50-day fell below 200-day ${m.cross.daysAgo === 0 ? "today" : `${m.cross.daysAgo} sessions ago`}`,
          reasons: ["The 50-day average crossed below the 200-day average, a long-term trend break", "Crossovers lag: much of the drop has usually happened by the time they print"],
          metrics: [{ label: "50-day", value: f2(m.sma50, 2) }, { label: "200-day", value: f2(m.sma200, 2) }, ...common],
          score: 1.4,
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

      if (h.peak && h.avgCost && h.avgCost > 0) {
        const fromPeak = m.last / h.peak.price - 1;
        const rule = t.trailStop * m.volScale;
        const peakGain = h.peak.price / h.avgCost - 1;
        // Only once there was a real gain to protect; below-cost drops are the "underwater" rule's job.
        if (peakGain >= 0.1 && -fromPeak >= rule) {
          add({
            type: "trailing-stop",
            severity: -fromPeak >= rule * 1.5 ? "warning" : "caution",
            symbol: s,
            title: `${s} is ${pct(-fromPeak, { digits: 0, sign: false })} off its high since you bought`,
            detail: `Peak gain ${pct(peakGain, { digits: 0 })} on ${fmtDate(h.peak.date, "short")} → ${pct(h.unrealizedPct, { digits: 0 })} now`,
            reasons: [
              `Highest close ${h.peak.price.toFixed(2)} on ${fmtDate(h.peak.date)}, now ${m.last.toFixed(2)} (rule: ${pct(rule, { digits: 0, sign: false })} drop${scaledNote(m)})`,
              `Your average cost is ${h.avgCost.toFixed(2)}`,
              "A drop from the high works like a trailing stop: it protects gains instead of anchoring on what you paid",
            ],
            metrics: [{ label: "From high", value: pct(fromPeak, { digits: 1 }) }, { label: "Peak gain", value: pct(peakGain, { digits: 0 }) }, ...common],
            score: 2 + -fromPeak * 4,
          });
        }
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

      gapSignal(s, m, true);

      const extRule = t.extendedPct * m.volScale;
      if (m.offSma50 != null && m.offSma50 >= extRule) {
        add({
          type: "extended",
          severity: "info",
          symbol: s,
          title: `${s} is ${pct(m.offSma50, { digits: 0, sign: false })} above its 50-day average`,
          detail: `Far above trend · a common point to consider trimming or tightening a stop`,
          reasons: [
            `Price ${m.last.toFixed(2)} vs 50-day ${f2(m.sma50, 2)} (rule: ${pct(extRule, { digits: 0, sign: false })} above${scaledNote(m)})`,
            "Stocks this far above their average tend to pause or pull back toward it",
          ],
          metrics: [{ label: "vs 50-day", value: pct(m.offSma50, { digits: 1 }) }, ...common],
          score: 1 + m.offSma50 / m.volScale,
        });
      }
    }

    const uwCaution = t.underwaterCaution * (fund ? 1 : m.volScale);
    const uwWarning = t.underwaterWarning * (fund ? 1 : m.volScale);
    if (h.unrealizedPct <= uwCaution) {
      const severe = h.unrealizedPct <= uwWarning;
      add({
        type: "underwater",
        severity: severe ? "warning" : "caution",
        symbol: s,
        title: `${s} is ${pct(-h.unrealizedPct, { digits: 0, sign: false })} below your cost`,
        detail: `Unrealized ${pct(h.unrealizedPct, { digits: 1 })} · review your thesis`,
        reasons: [`Down ${pct(h.unrealizedPct, { digits: 1 })} from your average cost (rule: ${pct(severe ? uwWarning : uwCaution, { digits: 0 })}${fund ? "" : scaledNote(m)})`],
        metrics: [{ label: "Unrealized", value: pct(h.unrealizedPct, { digits: 1 }) }, ...common],
        score: 1.5 + Math.abs(h.unrealizedPct / (fund ? 1 : m.volScale)) * 4,
      });
    }

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
      const change = consensus(recs[0]) - consensus(recs[1]);
      const buys = (r: RecTrend) => r.strongBuy + r.buy;
      const sells = (r: RecTrend) => r.sell + r.strongSell;
      if (change <= -t.downgradeDrop) {
        add({
          type: "downgrade",
          severity: "caution",
          symbol: s,
          title: `Analysts cooling on ${s}`,
          detail: `Buy ratings ${buys(recs[1])} → ${buys(recs[0])} this month`,
          reasons: [`Consensus score fell ${Math.abs(change).toFixed(2)} month over month (rule: ${t.downgradeDrop})`, `Sell ratings ${sells(recs[1])} → ${sells(recs[0])}`],
          metrics: [{ label: "Buy", value: String(buys(recs[0])) }, { label: "Hold", value: String(recs[0].hold) }, { label: "Sell", value: String(sells(recs[0])) }],
          score: 1.5 + Math.abs(change),
        });
      } else if (change >= t.downgradeDrop) {
        add({
          type: "upgrade",
          severity: "info",
          symbol: s,
          title: `Analysts warming to ${s}`,
          detail: `Buy ratings ${buys(recs[1])} → ${buys(recs[0])} this month`,
          reasons: [`Consensus score rose ${change.toFixed(2)} month over month (rule: ${t.downgradeDrop})`, `Sell ratings ${sells(recs[1])} → ${sells(recs[0])}`],
          metrics: [{ label: "Buy", value: String(buys(recs[0])) }, { label: "Hold", value: String(recs[0].hold) }, { label: "Sell", value: String(sells(recs[0])) }],
          score: 1.2 + change,
        });
      }
    }

    // Broad-market funds are diversified by design, so the single-stock cap doesn't apply.
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

    // Opportunities ───────────────────────────────────────────────────
    if (!fund) opportunities(s, m, { weight: h.weight, overCap, watch: false, common });
    insiderSignal(s, false);
  }

  // Watchlist ──────────────────────────────────────────────────────────
  for (const w of input.watchlist) {
    const m = metrics[w.symbol];
    if (!m) continue;
    if (w.target && m.last <= w.target) {
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
    opportunities(w.symbol, m, { weight: 0, overCap: false, watch: true, common: [{ label: "RSI", value: f2(m.rsi14) }, { label: "Trend", value: String(m.trendScore) }] });
    gapSignal(w.symbol, m, false);
    insiderSignal(w.symbol, true);
  }

  // Portfolio ──────────────────────────────────────────────────────────
  for (const sw of input.sectorWeights) {
    if (isDiversified(sw.sector) || sw.weight <= t.sectorCap) continue;
    add({
      type: "concentration-sector",
      severity: "caution",
      tag: "Risk",
      title: `${sw.sector} is ${pct(sw.weight, { digits: 0, sign: false })} of your portfolio`,
      detail: `Above your ${pct(t.sectorCap, { digits: 0, sign: false })} sector cap`,
      reasons: [`${money(sw.value)} in ${sw.sector}`, "Diversified funds are excluded from sector caps"],
      metrics: [{ label: "Weight", value: pct(sw.weight, { digits: 1, sign: false }) }, { label: "Cap", value: pct(t.sectorCap, { digits: 0, sign: false }) }],
      score: 2 + (sw.weight - t.sectorCap) * 8,
    });
  }

  for (const r of input.riskShares ?? []) {
    if (r.share < t.riskShareMin || r.share < r.weight * 1.5) continue;
    add({
      type: "risk-share",
      severity: "caution",
      symbol: r.symbol,
      tag: "Risk",
      title: `${r.symbol} drives ${pct(r.share, { digits: 0, sign: false })} of your portfolio's swings`,
      detail: `${pct(r.weight, { digits: 0, sign: false })} of your money · ${(r.share / Math.max(r.weight, 0.001)).toFixed(1)}× its weight in risk`,
      reasons: [
        `Over the last 6 months, ${pct(r.share, { digits: 0, sign: false })} of your portfolio's daily ups and downs came from ${r.symbol} (rule: ${pct(t.riskShareMin, { digits: 0, sign: false })}+ and at least 1.5× its weight)`,
        "Volatile, market-sensitive holdings carry more risk than their dollar weight suggests",
      ],
      metrics: [{ label: "Weight", value: pct(r.weight, { digits: 1, sign: false }) }, { label: "Risk share", value: pct(r.share, { digits: 1, sign: false }) }],
      score: 2 + (r.share - t.riskShareMin) * 6,
    });
  }

  for (const c of input.clusters ?? []) {
    if (c.weight <= t.clusterCap) continue;
    add({
      type: "cluster",
      severity: "caution",
      tag: "Risk",
      title: `${c.symbols.slice(0, 4).join(", ")}${c.symbols.length > 4 ? ` +${c.symbols.length - 4}` : ""} move together`,
      detail: `${pct(c.weight, { digits: 0, sign: false })} of your portfolio behaves like one position · correlation ${c.corr.toFixed(2)} beyond the market`,
      reasons: [
        `After removing what the S&P 500 explains, their daily returns still correlate ${c.corr.toFixed(2)} on average over 6 months (rule: every pair ${t.clusterCorr}+)`,
        `Combined ${pct(c.weight, { digits: 1, sign: false })} of your portfolio (rule: above ${pct(t.clusterCap, { digits: 0, sign: false })})`,
        "Positions that move together add up to more concentration than any one of them shows",
      ],
      metrics: [{ label: "Combined", value: pct(c.weight, { digits: 1, sign: false }) }, { label: "Correlation", value: c.corr.toFixed(2) }, { label: "Holdings", value: String(c.symbols.length) }],
      score: 2 + (c.weight - t.clusterCap) * 6,
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

  // Ex-dividend: only worth a heads-up on holdings that are already flagged, i.e. ones you might sell.
  const flagged = new Set(out.filter((x) => x.symbol && (x.severity === "warning" || x.severity === "caution")).map((x) => x.symbol!));
  for (const h of holdings) {
    if (!h.nextExDate || !h.divPerShare || !flagged.has(h.symbol)) continue;
    const days = diffDays(asOf, h.nextExDate);
    if (days < 0 || days > t.exDivDays) continue;
    const payout = ((h.quantity ?? 0) * h.divPerShare) / 4;
    add({
      type: "ex-dividend",
      severity: "info",
      symbol: h.symbol,
      title: `${h.symbol} goes ex-dividend ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`,
      detail: `About ${money(payout)} if you still hold it at the close ${days === 0 ? "today" : `on ${fmtDate(addDays(h.nextExDate, -1), "short")}`}`,
      reasons: [
        `Ex-dividend date ${fmtDate(h.nextExDate, "long")}: shares bought on or after it don't get the dividend`,
        `Estimated from ${money(h.divPerShare, { cents: true })} a year, paid quarterly`,
        "Shown because this holding has other warnings; selling before the ex-date gives up this payment",
      ],
      metrics: [{ label: "Ex-date", value: fmtDate(h.nextExDate, "short") }, { label: "Payout", value: money(payout) }],
      score: 0.9,
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
    const st = input.realized?.taxableShort ?? 0;
    const lt = input.realized?.taxableLong ?? 0;
    const gains = Math.max(0, st) + Math.max(0, lt);
    const offset = Math.min(-totalLoss, gains);
    add({
      type: "harvest",
      severity: "info",
      title: `${candidates.length} tax-loss harvest candidate${candidates.length > 1 ? "s" : ""}`,
      detail:
        gains > 0
          ? `${money(totalLoss)} in losses could offset ${money(offset)} of this year's ${money(gains)} realized gains`
          : `${money(totalLoss)} in unrealized losses · ${candidates.map(([sym]) => sym).slice(0, 4).join(", ")}`,
      reasons: [
        ...candidates.map(([sym, loss]) => `${sym}: ${money(loss)} in taxable lots${blocked.has(sym) ? " (wash-sale window still open)" : ""}`),
        gains > 0
          ? `Realized this year in taxable accounts: ${money(st, { sign: true })} short-term, ${money(lt, { sign: true })} long-term. Short-term gains are taxed at the higher rate, so they benefit most`
          : "No realized gains this year to offset; losses beyond gains offset up to $3,000 of income and carry forward",
        "Avoid rebuying the same security within 30 days in any account, IRAs included",
      ],
      metrics: [{ label: "Losses", value: money(totalLoss) }, { label: "Gains YTD", value: money(gains) }, { label: "Symbols", value: String(candidates.length) }],
      score: gains > 0 ? 1.6 : 1.1,
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
