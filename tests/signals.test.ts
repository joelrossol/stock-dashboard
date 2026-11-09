import { describe, expect, it } from "vitest";
import { volumePace } from "@/lib/analytics/indicators";
import type { SymbolMetrics } from "@/lib/analytics/metrics";
import { generateSignals, type HoldingContext, type SignalInput } from "@/lib/analytics/signals";
import { DEFAULT_THRESHOLDS } from "@/lib/analytics/thresholds";

const ASOF = "2026-11-06";

function metrics(symbol: string, over: Partial<SymbolMetrics> = {}): SymbolMetrics {
  return {
    symbol,
    last: 100,
    ret1d: 0.002,
    ret5d: 0.005,
    ret1m: 0.01,
    ret3m: 0.03,
    ret6m: 0.05,
    retYtd: 0.08,
    ret1y: 0.1,
    sma20: 99,
    sma50: 97,
    sma200: 90,
    rsi14: 55,
    trend20: { slopePerDay: 0.0005, r2: 0.3, annualized: 0.12 },
    trend60: { slopePerDay: 0.0005, r2: 0.3, annualized: 0.12 },
    consecDown: 0,
    down10: 0.4,
    moveZ: 0.2,
    volRatio: 1,
    high52: 110,
    low52: 80,
    offHigh52: -0.09,
    high20: 102,
    offHigh20: -0.02,
    newHigh52: false,
    freshBelow200: null,
    rs1m: 0,
    rs3m: 0,
    cross: null,
    beta1y: 1,
    vol1y: 0.16,
    trendScore: 20,
    trendLabel: "Uptrend",
    scoreParts: { trend: 0, averages: 0, relative: 0, drawdown: 0 },
    gap: 0,
    gapZ: 0,
    offSma50: 0.03,
    vol20: 0.14,
    volScale: 1,
    ...over,
  } as SymbolMetrics;
}

function holding(symbol: string, over: Partial<HoldingContext> = {}): HoldingContext {
  return { symbol, weight: 0.05, value: 5000, unrealizedPct: 0.1, sector: "Technology", quantity: 50, avgCost: 90, ...over };
}

function run(over: Partial<SignalInput>) {
  return generateSignals({
    metrics: {},
    holdings: [],
    sectorWeights: [],
    earnings: [],
    recs: {},
    watchlist: [],
    washSales: [],
    taxLots: [],
    cashWeight: 0.02,
    total: 100_000,
    asOf: ASOF,
    t: DEFAULT_THRESHOLDS,
    ...over,
  });
}

const uptrend = { trendScore: 70, rsi14: 60, trend60: { slopePerDay: 0.002, r2: 0.85, annualized: 0.5 } };

describe("market check", () => {
  it("flags a market below its 200-day and turns buy signals into info", () => {
    const out = run({
      market: metrics("SPY", { last: 95, sma200: 100 }),
      metrics: { MSFT: metrics("MSFT", uptrend) },
      holdings: [holding("MSFT")],
    });
    expect(out.find((s) => s.type === "market-regime")?.severity).toBe("caution");
    expect(out.find((s) => s.type === "buy-more")?.severity).toBe("info");
  });

  it("flags stressed volatility even above the 200-day", () => {
    const out = run({ market: metrics("SPY", { vol20: 0.32 }) });
    expect(out.some((s) => s.type === "market-regime")).toBe(true);
  });

  it("stays quiet in a healthy market", () => {
    const out = run({ market: metrics("SPY"), metrics: { MSFT: metrics("MSFT", uptrend) }, holdings: [holding("MSFT")] });
    expect(out.some((s) => s.type === "market-regime")).toBe(false);
    expect(out.find((s) => s.type === "buy-more")?.severity).toBe("opportunity");
  });
});

describe("volatility scaling", () => {
  it("a 7.5% week is a warning for a steady stock but not for a volatile one", () => {
    const steady = run({ metrics: { KO: metrics("KO", { ret5d: -0.075 }) }, holdings: [holding("KO")] });
    const wild = run({ metrics: { TSLA: metrics("TSLA", { ret5d: -0.075, volScale: 2.5 }) }, holdings: [holding("TSLA")] });
    expect(steady.some((s) => s.type === "losing-streak")).toBe(true);
    expect(wild.some((s) => s.type === "losing-streak")).toBe(false);
  });

  it("scales how far below cost counts as underwater", () => {
    const steady = run({ metrics: { KO: metrics("KO") }, holdings: [holding("KO", { unrealizedPct: -0.2 })] });
    const wild = run({ metrics: { TSLA: metrics("TSLA", { volScale: 2.5 }) }, holdings: [holding("TSLA", { unrealizedPct: -0.2 })] });
    expect(steady.some((s) => s.type === "underwater")).toBe(true);
    expect(wild.some((s) => s.type === "underwater")).toBe(false);
  });
});

describe("funds", () => {
  it("skip price-trend rules but keep the cost check", () => {
    const out = run({
      metrics: { VOO: metrics("VOO", { consecDown: 7, ret5d: -0.09, cross: { kind: "death", daysAgo: 2 } }) },
      holdings: [holding("VOO", { sector: "US large cap", unrealizedPct: -0.2, weight: 0.4 })],
    });
    expect(out.map((s) => s.type)).toEqual(["underwater"]);
  });
});

describe("new holding signals", () => {
  it("trailing stop fires only after a real gain", () => {
    const peak = { price: 140, date: "2026-07-01", since: "2025-11-06" };
    const gave = run({ metrics: { X: metrics("X") }, holdings: [holding("X", { avgCost: 100, peak })] });
    const never = run({ metrics: { X: metrics("X") }, holdings: [holding("X", { avgCost: 135, peak })] });
    expect(gave.some((s) => s.type === "trailing-stop")).toBe(true);
    expect(never.some((s) => s.type === "trailing-stop")).toBe(false);
  });

  it("extended above the 50-day", () => {
    const out = run({ metrics: { X: metrics("X", { offSma50: 0.22 }) }, holdings: [holding("X")] });
    expect(out.find((s) => s.type === "extended")?.severity).toBe("info");
  });

  it("analyst upgrade", () => {
    const rec = (buy: number, hold: number) => ({ symbol: "X", period: "", strongBuy: 0, buy, hold, sell: 0, strongSell: 0 });
    const out = run({ metrics: { X: metrics("X") }, holdings: [holding("X")], recs: { X: [rec(20, 5), rec(10, 15)] } });
    expect(out.some((s) => s.type === "upgrade")).toBe(true);
  });

  it("earnings gap down on a holding is a warning", () => {
    const out = run({
      metrics: { X: metrics("X", { gap: -0.08, gapZ: -4, ret1d: -0.09 }) },
      holdings: [holding("X")],
      earnings: [{ symbol: "X", date: "2026-11-05", hour: "amc" }],
    });
    const g = out.find((s) => s.type === "gap")!;
    expect(g.severity).toBe("warning");
    expect(g.title).toContain("after earnings");
  });

  it("ex-dividend heads-up only on holdings that already have a warning", () => {
    const base = { nextExDate: "2026-11-09", divPerShare: 4, quantity: 100 };
    const flagged = run({ metrics: { X: metrics("X", { consecDown: 6 }) }, holdings: [holding("X", base)] });
    const calm = run({ metrics: { X: metrics("X") }, holdings: [holding("X", base)] });
    expect(flagged.find((s) => s.type === "ex-dividend")?.detail).toContain("$100");
    expect(calm.some((s) => s.type === "ex-dividend")).toBe(false);
  });

  it("insider buying needs several insiders", () => {
    const buy = (name: string) => ({ symbol: "X", name, date: "2026-10-20", shares: 1000, price: 50, code: "P" as const });
    const two = run({ metrics: { X: metrics("X") }, holdings: [holding("X")], insiders: { X: [buy("A"), buy("B")] } });
    const one = run({ metrics: { X: metrics("X") }, holdings: [holding("X")], insiders: { X: [buy("A"), buy("A")] } });
    expect(two.some((s) => s.type === "insider-buying")).toBe(true);
    expect(one.some((s) => s.type === "insider-buying")).toBe(false);
  });
});

describe("portfolio and tax", () => {
  it("risk share needs both size and outsized risk", () => {
    const out = run({ riskShares: [{ symbol: "NVDA", weight: 0.15, share: 0.35 }, { symbol: "VOO", weight: 0.4, share: 0.38 }] });
    expect(out.filter((s) => s.type === "risk-share").map((s) => s.symbol)).toEqual(["NVDA"]);
  });

  it("harvest compares losses with realized gains", () => {
    const lot = { accountId: "a", symbol: "X", qty: 10, price: 200, date: "2026-01-02", txnId: "t", current: 100, unrealized: -1000, holdingDays: 300, longTermDate: "2027-01-03", daysToLongTerm: 58 };
    const out = run({ taxLots: [lot], realized: { taxableShort: 600, taxableLong: 0 } });
    expect(out.find((s) => s.type === "harvest")?.detail).toContain("offset $600");
  });

  it("runs the opportunity rules on watchlist names", () => {
    const out = run({ metrics: { LLY: metrics("LLY", uptrend) }, watchlist: [{ symbol: "LLY" }] });
    const b = out.find((s) => s.type === "buy-more" && s.symbol === "LLY")!;
    expect(b.tag).toBe("Watchlist · Buy signal");
  });
});

describe("volume pace", () => {
  it("projects partial-day volume to a full day", () => {
    expect(volumePace(5)).toBeNull();
    expect(volumePace(390)).toBe(1);
    expect(volumePace(120)).toBeCloseTo(0.3, 2);
    expect(volumePace(150)! > volumePace(120)!).toBe(true);
  });
});
