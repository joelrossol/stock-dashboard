/**
 * Signal thresholds. Every value is adjustable from Settings.
 *
 * Fixed % rules marked "volatility-scaled" are written for a stock that moves
 * like the S&P 500 (about 16% a year) and stretch with each stock's own
 * volatility: a stock twice as volatile needs a move twice as big (see
 * SymbolMetrics.volScale).
 */
export interface Thresholds {
  losingStreakDays: number;
  fiveDayDrop: number; // fraction, negative · volatility-scaled
  downtrendR2: number;
  underwaterCaution: number; // fraction, negative · volatility-scaled
  underwaterWarning: number; // volatility-scaled
  trailStop: number; // drop from the high since you bought · volatility-scaled
  laggardGap: number; // vs S&P over 3 months
  abnormalZ: number; // negative
  gapZ: number; // opening gap, in normal daily moves
  earningsDays: number;
  downgradeDrop: number; // change in consensus score, either direction
  stockCap: number; // single-stock weight cap
  sectorCap: number;
  riskShareMin: number; // share of portfolio swings from one holding
  clusterCorr: number; // correlation beyond the market that counts as "moves together"
  clusterCap: number; // combined weight of a correlated group
  idleCash: number;
  regimeVol: number; // S&P annualized volatility (20-day) that counts as stressed
  buyTrendScore: number;
  buyMinR2: number;
  buyMaxRsi: number;
  buyEarningsBuffer: number; // days
  dipMin: number; // volatility-scaled
  dipMax: number; // volatility-scaled
  dipRsi: number;
  breakoutVolume: number;
  extendedPct: number; // above the 50-day average · volatility-scaled
  crossWithin: number; // sessions
  insiderMin: number; // distinct insiders buying in 90 days
  exDivDays: number;
  harvestMin: number; // $
  ltWindowDays: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  losingStreakDays: 5,
  fiveDayDrop: -0.07,
  downtrendR2: 0.6,
  underwaterCaution: -0.15,
  underwaterWarning: -0.25,
  trailStop: 0.2,
  laggardGap: 0.15,
  abnormalZ: -2.5,
  gapZ: 2,
  earningsDays: 7,
  downgradeDrop: 0.25,
  stockCap: 0.2,
  sectorCap: 0.4,
  riskShareMin: 0.2,
  clusterCorr: 0.4,
  clusterCap: 0.25,
  idleCash: 0.1,
  regimeVol: 0.25,
  buyTrendScore: 60,
  buyMinR2: 0.7,
  buyMaxRsi: 70,
  buyEarningsBuffer: 5,
  dipMin: 0.05,
  dipMax: 0.12,
  dipRsi: 40,
  breakoutVolume: 1.5,
  extendedPct: 0.15,
  crossWithin: 20,
  insiderMin: 2,
  exDivDays: 7,
  harvestMin: 500,
  ltWindowDays: 30,
};

export type ThresholdUnit = "%" | "days" | "sessions" | "x" | "$" | "score" | "r2" | "z" | "count";

/** Fields shown on the Settings page, in display order. `scaled` marks volatility-scaled rules. */
export const THRESHOLD_FIELDS: { key: keyof Thresholds; label: string; unit: ThresholdUnit; group: string; scaled?: boolean }[] = [
  { key: "losingStreakDays", label: "Losing streak length", unit: "days", group: "Warnings" },
  { key: "fiveDayDrop", label: "5-day drop", unit: "%", group: "Warnings", scaled: true },
  { key: "downtrendR2", label: "Downtrend consistency (R²)", unit: "r2", group: "Warnings" },
  { key: "underwaterCaution", label: "Below your cost, caution", unit: "%", group: "Warnings", scaled: true },
  { key: "underwaterWarning", label: "Below your cost, warning", unit: "%", group: "Warnings", scaled: true },
  { key: "trailStop", label: "Drop from high since you bought", unit: "%", group: "Warnings", scaled: true },
  { key: "laggardGap", label: "Laggard gap vs S&P (3M)", unit: "%", group: "Warnings" },
  { key: "abnormalZ", label: "Abnormal move z-score", unit: "z", group: "Warnings" },
  { key: "gapZ", label: "Opening gap size", unit: "z", group: "Warnings" },
  { key: "earningsDays", label: "Earnings heads-up", unit: "days", group: "Warnings" },
  { key: "downgradeDrop", label: "Analyst rating change", unit: "score", group: "Warnings" },
  { key: "crossWithin", label: "Recent crossover window", unit: "sessions", group: "Warnings" },
  { key: "stockCap", label: "Single-stock cap", unit: "%", group: "Risk" },
  { key: "sectorCap", label: "Sector cap", unit: "%", group: "Risk" },
  { key: "riskShareMin", label: "One holding's share of swings", unit: "%", group: "Risk" },
  { key: "clusterCorr", label: "Moves together, beyond the market", unit: "r2", group: "Risk" },
  { key: "clusterCap", label: "Correlated group cap", unit: "%", group: "Risk" },
  { key: "idleCash", label: "Idle cash", unit: "%", group: "Risk" },
  { key: "regimeVol", label: "Stressed market volatility (S&P)", unit: "%", group: "Risk" },
  { key: "buyTrendScore", label: "Buy-more trend score", unit: "score", group: "Opportunities" },
  { key: "buyMinR2", label: "Buy-more trend consistency (R²)", unit: "r2", group: "Opportunities" },
  { key: "buyMaxRsi", label: "Buy-more max RSI", unit: "score", group: "Opportunities" },
  { key: "buyEarningsBuffer", label: "No buys this close to earnings", unit: "days", group: "Opportunities" },
  { key: "dipMin", label: "Dip size, min", unit: "%", group: "Opportunities", scaled: true },
  { key: "dipMax", label: "Dip size, max", unit: "%", group: "Opportunities", scaled: true },
  { key: "dipRsi", label: "Dip RSI (or lower)", unit: "score", group: "Opportunities" },
  { key: "breakoutVolume", label: "Breakout volume", unit: "x", group: "Opportunities" },
  { key: "extendedPct", label: "Far above 50-day average", unit: "%", group: "Opportunities", scaled: true },
  { key: "insiderMin", label: "Insiders buying (90 days)", unit: "count", group: "Opportunities" },
  { key: "harvestMin", label: "Tax-loss harvest minimum", unit: "$", group: "Tax" },
  { key: "ltWindowDays", label: "Long-term countdown window", unit: "days", group: "Tax" },
  { key: "exDivDays", label: "Ex-dividend heads-up", unit: "days", group: "Tax" },
];
