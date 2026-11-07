/** Signal thresholds. Every value is adjustable from Settings. */
export interface Thresholds {
  losingStreakDays: number;
  fiveDayDrop: number; // fraction, negative
  downtrendR2: number;
  underwaterCaution: number; // fraction, negative
  underwaterWarning: number;
  laggardGap: number; // vs S&P over 3 months
  abnormalZ: number; // negative
  earningsDays: number;
  stockCap: number; // single-stock weight cap
  sectorCap: number;
  buyTrendScore: number;
  buyMinR2: number;
  buyMaxRsi: number;
  buyEarningsBuffer: number; // days
  dipMin: number;
  dipMax: number;
  dipRsi: number;
  breakoutVolume: number;
  idleCash: number;
  crossWithin: number; // sessions
  harvestMin: number; // $
  ltWindowDays: number;
  downgradeDrop: number; // drop in consensus score
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  losingStreakDays: 5,
  fiveDayDrop: -0.07,
  downtrendR2: 0.6,
  underwaterCaution: -0.15,
  underwaterWarning: -0.25,
  laggardGap: 0.15,
  abnormalZ: -2.5,
  earningsDays: 7,
  stockCap: 0.2,
  sectorCap: 0.4,
  buyTrendScore: 60,
  buyMinR2: 0.7,
  buyMaxRsi: 70,
  buyEarningsBuffer: 5,
  dipMin: 0.05,
  dipMax: 0.12,
  dipRsi: 40,
  breakoutVolume: 1.5,
  idleCash: 0.1,
  crossWithin: 20,
  harvestMin: 500,
  ltWindowDays: 30,
  downgradeDrop: 0.25,
};

/** Fields shown on the Settings page, in display order. */
export const THRESHOLD_FIELDS: { key: keyof Thresholds; label: string; unit: "%" | "days" | "x" | "$" | "score" | "r2" | "z"; group: string }[] = [
  { key: "losingStreakDays", label: "Losing streak length", unit: "days", group: "Warnings" },
  { key: "fiveDayDrop", label: "5-day drop", unit: "%", group: "Warnings" },
  { key: "downtrendR2", label: "Downtrend consistency (R²)", unit: "r2", group: "Warnings" },
  { key: "underwaterCaution", label: "Underwater caution", unit: "%", group: "Warnings" },
  { key: "underwaterWarning", label: "Underwater warning", unit: "%", group: "Warnings" },
  { key: "laggardGap", label: "Laggard gap vs S&P (3M)", unit: "%", group: "Warnings" },
  { key: "abnormalZ", label: "Abnormal move z-score", unit: "z", group: "Warnings" },
  { key: "earningsDays", label: "Earnings heads-up", unit: "days", group: "Warnings" },
  { key: "stockCap", label: "Single-stock cap", unit: "%", group: "Risk" },
  { key: "sectorCap", label: "Sector cap", unit: "%", group: "Risk" },
  { key: "idleCash", label: "Idle cash", unit: "%", group: "Risk" },
  { key: "buyTrendScore", label: "Buy-more trend score", unit: "score", group: "Opportunities" },
  { key: "buyMinR2", label: "Buy-more trend consistency (R²)", unit: "r2", group: "Opportunities" },
  { key: "buyMaxRsi", label: "Buy-more max RSI", unit: "score", group: "Opportunities" },
  { key: "buyEarningsBuffer", label: "No buys this close to earnings", unit: "days", group: "Opportunities" },
  { key: "dipMin", label: "Dip size, min", unit: "%", group: "Opportunities" },
  { key: "dipMax", label: "Dip size, max", unit: "%", group: "Opportunities" },
  { key: "breakoutVolume", label: "Breakout volume", unit: "x", group: "Opportunities" },
  { key: "harvestMin", label: "Tax-loss harvest minimum", unit: "$", group: "Tax" },
  { key: "ltWindowDays", label: "Long-term countdown window", unit: "days", group: "Tax" },
];
