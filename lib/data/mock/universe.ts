/**
 * Sample-data universe. Each symbol has a scripted "personality" so every
 * insight in the app fires at least once. Prices are plausible but invented.
 */
import {
  consecutiveDown,
  lastSma,
  logTrend,
  moveZ,
  pctReturn,
  recentCross,
  rsi,
  volumeRatio,
  windowHigh,
} from "@/lib/analytics/indicators";
import type { AssetType } from "@/lib/data/types";

/** [sessions, annual drift, annual volatility] — listed newest first; the last one fills the rest. */
export type Segment = [number, number, number];

export interface ScenarioInput {
  closes: number[];
  volumes: number[];
  spy: number[];
}

export interface MockSymbol {
  symbol: string;
  name: string;
  assetType: AssetType;
  industry: string; // Finnhub-style industry
  price: number; // today's close
  todayPct: number; // today's move, %
  segs: Segment[];
  tail?: number[]; // exact daily moves (%) before today, oldest first
  volume: number; // typical daily shares
  volSpike?: number; // today's volume multiple
  pe?: number;
  divYield?: number; // %
  marketCapB?: number;
  beta?: number; // sensitivity to the market factor
  check?: (s: ScenarioInput) => boolean;
}

const INF = 10_000;

/** Close `d` sessions ago. */
const ago = (closes: number[], d: number) => closes[closes.length - 1 - d];

export const UNIVERSE: MockSymbol[] = [
  // ── Benchmarks and ETFs ─────────────────────────────────────────────
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", assetType: "ETF", industry: "ETF", price: 612.1, todayPct: 0.6, segs: [[INF, 0.14, 0.15]], volume: 5_200_000, divYield: 1.3 },
  { symbol: "QQQ", name: "Invesco QQQ Trust", assetType: "ETF", industry: "ETF", price: 618.4, todayPct: 1.3, segs: [[INF, 0.18, 0.19]], volume: 38_000_000, divYield: 0.6 },
  { symbol: "SCHD", name: "Schwab US Dividend Equity ETF", assetType: "ETF", industry: "ETF", price: 28.4, todayPct: 0.1, segs: [[INF, 0.06, 0.12]], volume: 14_000_000, divYield: 3.8 },

  // ── Holdings ────────────────────────────────────────────────────────
  {
    symbol: "NVDA", name: "NVIDIA Corp", assetType: "EQUITY", industry: "Semiconductors", price: 198.4, todayPct: 2.8,
    segs: [[120, 0.5, 0.34], [INF, 0.62, 0.42]], volume: 210_000_000, pe: 48, divYield: 0.02, marketCapB: 4830,
    check: ({ closes }) => {
      const r = rsi(closes) ?? 0;
      const last = closes.at(-1)!;
      return r < 68 && last > (lastSma(closes, 50) ?? 0) && last > (lastSma(closes, 200) ?? 0) && (logTrend(closes, 60)?.r2 ?? 0) > 0.45;
    },
  },
  {
    symbol: "AAPL", name: "Apple Inc", assetType: "EQUITY", industry: "Technology", price: 268.9, todayPct: 1.2,
    segs: [[90, 0.3, 0.2], [INF, 0.12, 0.24]], volume: 52_000_000, pe: 33, divYield: 0.4, marketCapB: 3990,
    check: ({ closes }) => closes.at(-1)! > (lastSma(closes, 50) ?? Infinity) && (rsi(closes) ?? 100) < 70 && ago(closes, 245) < closes.at(-1)! * 0.9 && ago(closes, 470) < closes.at(-1)! * 0.85,
  },
  {
    symbol: "MSFT", name: "Microsoft Corp", assetType: "EQUITY", industry: "Technology", price: 541.2, todayPct: 0.9,
    segs: [[60, 0.42, 0.1], [INF, 0.12, 0.2]], volume: 21_000_000, pe: 36, divYield: 0.7, marketCapB: 4020, beta: 0.35,
    check: ({ closes }) => {
      const t = logTrend(closes, 60);
      const r = rsi(closes) ?? 100;
      return !!t && t.r2 >= 0.75 && r < 69 && r > 50 && closes.at(-1)! >= windowHigh(closes, 252) * 0.97;
    },
  },
  {
    symbol: "AMZN", name: "Amazon.com Inc", assetType: "EQUITY", industry: "Retail", price: 231.7, todayPct: -0.4,
    segs: [[120, 0.0, 0.22], [INF, 0.15, 0.28]], volume: 41_000_000, pe: 35, marketCapB: 2470,
  },
  {
    symbol: "GOOGL", name: "Alphabet Inc Class A", assetType: "EQUITY", industry: "Media", price: 284.5, todayPct: 1.6,
    segs: [[INF, 0.25, 0.26]], volume: 30_000_000, pe: 27, divYield: 0.3, marketCapB: 3440,
  },
  {
    symbol: "META", name: "Meta Platforms Inc", assetType: "EQUITY", industry: "Media", price: 742.3, todayPct: 3.1,
    segs: [[150, 0.5, 0.3], [60, -0.95, 0.32], [INF, 0.2, 0.3]], volume: 13_000_000, pe: 29, divYield: 0.3, marketCapB: 1870,
    check: ({ closes }) => {
      const n = closes.length;
      const at = closes[n - 1 - 150];
      const win = closes.slice(n - 1 - 215, n - 1 - 95);
      return at <= Math.min(...win) * 1.05;
    },
  },
  {
    symbol: "AVGO", name: "Broadcom Inc", assetType: "EQUITY", industry: "Semiconductors", price: 372.8, todayPct: 2.2,
    segs: [[25, 0.2, 0.13], [65, -0.3, 0.15], [INF, 0.42, 0.3]], tail: [1.4, 0.9, 1.7], volume: 24_000_000, volSpike: 1.9, pe: 41, divYield: 0.7, marketCapB: 1750, beta: 0.5,
    check: ({ closes, volumes }) => closes.at(-1)! >= windowHigh(closes.slice(0, -1), 251) * 1.003 && (volumeRatio(volumes) ?? 0) >= 1.5,
  },
  {
    symbol: "COST", name: "Costco Wholesale Corp", assetType: "EQUITY", industry: "Retail", price: 968.2, todayPct: 0.3,
    segs: [[INF, 0.16, 0.17]], volume: 2_100_000, pe: 52, divYield: 0.5, marketCapB: 430,
  },
  {
    symbol: "JPM", name: "JPMorgan Chase & Co", assetType: "EQUITY", industry: "Banking", price: 312.6, todayPct: -0.8,
    segs: [[INF, 0.18, 0.2]], volume: 9_000_000, pe: 15, divYield: 2.0, marketCapB: 860,
  },
  {
    symbol: "TSLA", name: "Tesla Inc", assetType: "EQUITY", industry: "Automobiles", price: 438.9, todayPct: 4.2,
    segs: [[INF, 0.3, 0.58]], volume: 95_000_000, pe: 160, marketCapB: 1410,
    // Swing trade: bought 350 sessions ago, sold at 270 for a gain, then it slid.
    check: ({ closes }) => consecutiveDown(closes) < 4 && ago(closes, 270) > ago(closes, 350) * 1.15 && ago(closes, 200) < ago(closes, 270) * 0.85,
  },
  {
    symbol: "XOM", name: "Exxon Mobil Corp", assetType: "EQUITY", industry: "Energy", price: 118.7, todayPct: -3.1,
    segs: [[INF, 0.04, 0.15]], volume: 16_000_000, volSpike: 2.1, pe: 15, divYield: 3.4, marketCapB: 505,
    check: ({ closes }) => (moveZ(closes) ?? 0) <= -2.6,
  },
  {
    symbol: "INTC", name: "Intel Corp", assetType: "EQUITY", industry: "Semiconductors", price: 21.85, todayPct: -2.7,
    segs: [[40, -0.3, 0.3], [INF, -0.06, 0.38]], tail: [-1.2, -1.6, -0.9, -2.1, -1.4], volume: 75_000_000, volSpike: 1.3, marketCapB: 95,
    check: ({ closes }) => consecutiveDown(closes) >= 6 && closes.at(-1)! < (lastSma(closes, 50) ?? 0) && ago(closes, 300) > ago(closes, 25) * 1.15,
  },
  {
    symbol: "V", name: "Visa Inc", assetType: "EQUITY", industry: "Financial Services", price: 352.4, todayPct: 0.4,
    segs: [[INF, 0.14, 0.17]], volume: 6_500_000, pe: 31, divYield: 0.7, marketCapB: 690,
  },
  {
    symbol: "UNH", name: "UnitedHealth Group Inc", assetType: "EQUITY", industry: "Health Care", price: 312.4, todayPct: -1.9,
    segs: [[60, -1.05, 0.2], [120, 0.04, 0.18], [INF, 0.1, 0.2]], volume: 5_000_000, pe: 18, divYield: 2.6, marketCapB: 285,
    check: ({ closes }) => {
      const c = recentCross(closes, 50, 200, 15);
      const t = logTrend(closes, 20);
      return c?.kind === "death" && closes.at(-1)! < (lastSma(closes, 200) ?? 0) && !!t && t.slopePerDay < 0 && t.r2 > 0.6;
    },
  },
  {
    symbol: "PLTR", name: "Palantir Technologies Inc", assetType: "EQUITY", industry: "Technology", price: 182.6, todayPct: 5.1,
    segs: [[40, 1.7, 0.42], [INF, 1.0, 0.6]], volume: 60_000_000, pe: 240, marketCapB: 430,
    check: ({ closes }) => (rsi(closes) ?? 0) >= 72,
  },
  {
    symbol: "KO", name: "Coca-Cola Co", assetType: "EQUITY", industry: "Beverages", price: 71.2, todayPct: 0.2,
    segs: [[INF, 0.06, 0.13]], volume: 14_000_000, pe: 24, divYield: 2.9, marketCapB: 307,
  },
  {
    symbol: "AMD", name: "Advanced Micro Devices Inc", assetType: "EQUITY", industry: "Semiconductors", price: 228.4, todayPct: -0.6,
    segs: [[8, -2.6, 0.25], [INF, 0.55, 0.45]], volume: 48_000_000, pe: 95, marketCapB: 370,
    check: ({ closes }) => {
      const last = closes.at(-1)!;
      const off = last / windowHigh(closes, 20) - 1;
      return last > (lastSma(closes, 200) ?? Infinity) && (logTrend(closes, 60)?.slopePerDay ?? -1) > 0 && off <= -0.05 && off >= -0.12;
    },
  },
  {
    symbol: "DIS", name: "Walt Disney Co", assetType: "EQUITY", industry: "Media", price: 112.3, todayPct: -0.3,
    segs: [[63, -0.62, 0.17], [INF, 0.05, 0.22]], volume: 9_000_000, pe: 22, marketCapB: 203,
    check: ({ closes, spy }) => (pctReturn(closes, 63) ?? 0) < (pctReturn(spy, 63) ?? 0) - 0.16,
  },
  {
    symbol: "CRWD", name: "CrowdStrike Holdings Inc", assetType: "EQUITY", industry: "Technology", price: 512.7, todayPct: 1.9,
    segs: [[80, 1.15, 0.33], [130, -0.75, 0.33], [INF, 0.4, 0.38]], volume: 3_200_000, pe: 120, marketCapB: 128,
    check: ({ closes }) => recentCross(closes, 50, 200, 15)?.kind === "golden" && (rsi(closes) ?? 100) < 75,
  },

  // ── Closed positions (for trade grading) ────────────────────────────
  {
    symbol: "NKE", name: "Nike Inc", assetType: "EQUITY", industry: "Apparel", price: 61.2, todayPct: -0.5, segs: [[INF, -0.25, 0.27]], volume: 11_000_000, pe: 28, divYield: 2.4, marketCapB: 91,
    check: ({ closes }) => ago(closes, 380) > ago(closes, 280) * 1.04 && ago(closes, 280) > closes.at(-1)! * 1.2,
  },
  {
    symbol: "SHOP", name: "Shopify Inc", assetType: "EQUITY", industry: "Technology", price: 162.4, todayPct: 1.4,
    segs: [[200, 0.95, 0.42], [40, -1.9, 0.48], [INF, 0.3, 0.5]], volume: 8_000_000, pe: 110, marketCapB: 211,
    check: ({ closes }) => {
      const n = closes.length;
      const at = closes[n - 1 - 205];
      return at <= Math.min(...closes.slice(n - 1 - 245, n - 1 - 195)) * 1.06;
    },
  },
  {
    symbol: "PYPL", name: "PayPal Holdings Inc", assetType: "EQUITY", industry: "Financial Services", price: 68.9, todayPct: -0.2, segs: [[INF, 0.0, 0.32]], volume: 12_000_000, pe: 15, marketCapB: 67,
    check: ({ closes }) => ago(closes, 240) > ago(closes, 420) * 1.1,
  },
  {
    symbol: "BA", name: "Boeing Co", assetType: "EQUITY", industry: "Aerospace & Defense", price: 214.3, todayPct: 0.8, segs: [[150, 0.6, 0.3], [INF, -0.1, 0.32]], volume: 7_000_000, marketCapB: 162,
    check: ({ closes }) => ago(closes, 200) > ago(closes, 160) * 1.03 && closes.at(-1)! > ago(closes, 160) * 1.25,
  },

  // ── Watchlist ───────────────────────────────────────────────────────
  { symbol: "NFLX", name: "Netflix Inc", assetType: "EQUITY", industry: "Media", price: 112.4, todayPct: -1.1, segs: [[30, -0.5, 0.3], [INF, 0.35, 0.32]], volume: 40_000_000, pe: 44, marketCapB: 478 },
  { symbol: "LLY", name: "Eli Lilly and Co", assetType: "EQUITY", industry: "Pharmaceuticals", price: 812.5, todayPct: 0.7, segs: [[INF, 0.2, 0.3]], volume: 3_400_000, pe: 58, divYield: 0.7, marketCapB: 770 },
  { symbol: "TGT", name: "Target Corp", assetType: "EQUITY", industry: "Retail", price: 96.4, todayPct: -0.9, segs: [[INF, -0.15, 0.3]], volume: 5_600_000, pe: 11, divYield: 4.6, marketCapB: 44 },
  { symbol: "ADBE", name: "Adobe Inc", assetType: "EQUITY", industry: "Technology", price: 348.2, todayPct: 0.4, segs: [[INF, -0.05, 0.28]], volume: 3_300_000, pe: 22, marketCapB: 148 },
  { symbol: "CRM", name: "Salesforce Inc", assetType: "EQUITY", industry: "Technology", price: 248.9, todayPct: 1.0, segs: [[INF, 0.06, 0.28]], volume: 6_000_000, pe: 38, divYield: 0.6, marketCapB: 238 },
  { symbol: "SNOW", name: "Snowflake Inc", assetType: "EQUITY", industry: "Technology", price: 228.1, todayPct: 2.4, segs: [[INF, 0.45, 0.45]], volume: 5_100_000, marketCapB: 77 },
  { symbol: "UBER", name: "Uber Technologies Inc", assetType: "EQUITY", industry: "Road & Rail", price: 94.3, todayPct: 0.9, segs: [[INF, 0.28, 0.34]], volume: 18_000_000, pe: 16, marketCapB: 197 },
  { symbol: "ABNB", name: "Airbnb Inc", assetType: "EQUITY", industry: "Hotels, Restaurants & Leisure", price: 128.7, todayPct: -0.4, segs: [[INF, 0.0, 0.36]], volume: 4_800_000, pe: 32, marketCapB: 79 },
  { symbol: "SBUX", name: "Starbucks Corp", assetType: "EQUITY", industry: "Hotels, Restaurants & Leisure", price: 84.6, todayPct: 0.3, segs: [[INF, -0.04, 0.27]], volume: 9_000_000, pe: 30, divYield: 2.9, marketCapB: 96 },
  { symbol: "ARM", name: "Arm Holdings plc ADR", assetType: "EQUITY", industry: "Semiconductors", price: 158.2, todayPct: 3.3, segs: [[INF, 0.3, 0.55]], volume: 6_500_000, pe: 190, marketCapB: 167 },
  { symbol: "COIN", name: "Coinbase Global Inc", assetType: "EQUITY", industry: "Financial Services", price: 312.5, todayPct: -2.2, segs: [[INF, 0.4, 0.65]], volume: 9_500_000, pe: 34, marketCapB: 79 },
  { symbol: "NOW", name: "ServiceNow Inc", assetType: "EQUITY", industry: "Technology", price: 188.4, todayPct: 0.6, segs: [[INF, 0.2, 0.3]], volume: 6_000_000, pe: 60, marketCapB: 195 },
];

/** SPY is derived from VOO so the two track exactly. */
export const SPY_PRICE = 667.8;

export const WATCHLIST_SEED: { list: string; symbol: string; target?: number; note?: string }[] = [
  { list: "Main", symbol: "NFLX", target: 115, note: "Re-entry below 115" },
  { list: "Main", symbol: "LLY", target: 780 },
  { list: "Main", symbol: "TGT", target: 90, note: "Earnings first" },
  { list: "Main", symbol: "ADBE", target: 320 },
  { list: "Main", symbol: "CRM", target: 230 },
  { list: "Main", symbol: "UBER", target: 85 },
  { list: "Main", symbol: "NOW", target: 175 },
  { list: "Main", symbol: "SBUX" },
  { list: "Speculative", symbol: "SNOW", target: 200 },
  { list: "Speculative", symbol: "ARM", target: 140 },
  { list: "Speculative", symbol: "COIN", target: 260 },
  { list: "Speculative", symbol: "ABNB", target: 115 },
];

export function findMock(symbol: string): MockSymbol | undefined {
  return UNIVERSE.find((u) => u.symbol === symbol);
}

const BETA_BY_INDUSTRY: Record<string, number> = {
  Semiconductors: 1.5,
  Technology: 1.25,
  Media: 1.1,
  Retail: 1.0,
  Automobiles: 1.8,
  Banking: 1.1,
  "Financial Services": 1.15,
  Energy: 0.75,
  "Health Care": 0.7,
  Pharmaceuticals: 0.6,
  Beverages: 0.55,
  Apparel: 1.0,
  "Aerospace & Defense": 1.2,
  "Road & Rail": 1.2,
  "Hotels, Restaurants & Leisure": 1.1,
};

export function betaOf(def: MockSymbol): number {
  if (def.beta != null) return def.beta;
  if (def.symbol === "VOO") return 1;
  if (def.symbol === "QQQ") return 1.15;
  if (def.symbol === "SCHD") return 0.8;
  return BETA_BY_INDUSTRY[def.industry] ?? 1;
}
