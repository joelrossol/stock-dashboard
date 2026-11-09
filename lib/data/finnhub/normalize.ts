/** Raw Finnhub JSON → domain types. */
import { z } from "zod";
import type { EarningsEvent, InsiderTxn, NewsItem, RecTrend } from "@/lib/data/types";

/** Finnhub reports an industry; map it onto a broad sector for allocation views. */
const SECTOR_OF_INDUSTRY: Record<string, string> = {
  Technology: "Technology",
  Semiconductors: "Technology",
  Software: "Technology",
  Media: "Communication",
  Telecommunication: "Communication",
  Retail: "Consumer",
  Automobiles: "Consumer",
  Apparel: "Consumer",
  "Hotels, Restaurants & Leisure": "Consumer",
  Beverages: "Staples",
  "Food Products": "Staples",
  Banking: "Financials",
  "Financial Services": "Financials",
  Insurance: "Financials",
  Energy: "Energy",
  "Health Care": "Health Care",
  Pharmaceuticals: "Health Care",
  Biotechnology: "Health Care",
  "Aerospace & Defense": "Industrials",
  "Road & Rail": "Industrials",
  Machinery: "Industrials",
  ETF: "Broad market",
  Communications: "Communication",
  "Diversified Consumer Services": "Consumer",
  "Textiles, Apparel & Luxury Goods": "Consumer",
  "Leisure Products": "Consumer",
  "Auto Components": "Consumer",
  Distributors: "Consumer",
  "Consumer products": "Staples",
  Tobacco: "Staples",
  "Food & Staples Retailing": "Staples",
  "Life Sciences Tools & Services": "Health Care",
  "Health Care Equipment & Supplies": "Health Care",
  "Health Care Providers & Services": "Health Care",
  Airlines: "Industrials",
  "Logistics & Transportation": "Industrials",
  "Electrical Equipment": "Industrials",
  "Industrial Conglomerates": "Industrials",
  "Professional Services": "Industrials",
  "Commercial Services & Supplies": "Industrials",
  Construction: "Industrials",
  Building: "Industrials",
  "Trading Companies & Distributors": "Industrials",
  Marine: "Industrials",
  Chemicals: "Materials",
  "Metals & Mining": "Materials",
  Packaging: "Materials",
  "Real Estate": "Real Estate",
  Utilities: "Utilities",
  "Oil & Gas": "Energy",
  "Capital Markets": "Financials",
};

export function sectorOf(industry: string | undefined): string {
  if (!industry) return "Other";
  return SECTOR_OF_INDUSTRY[industry.trim()] ?? industry.trim();
}

const EarningsSchema = z.object({
  earningsCalendar: z
    .array(
      z.object({
        date: z.string(),
        symbol: z.string(),
        hour: z.string().optional().default(""),
        epsEstimate: z.number().nullable().optional(),
      }),
    )
    .default([]),
});

export function normalizeEarnings(raw: unknown): EarningsEvent[] {
  return EarningsSchema.parse(raw).earningsCalendar.map((e) => ({
    symbol: e.symbol,
    date: e.date,
    hour: e.hour === "bmo" || e.hour === "amc" ? e.hour : "",
    epsEstimate: e.epsEstimate ?? undefined,
  }));
}

const ProfileSchema = z.object({
  name: z.string().optional(),
  finnhubIndustry: z.string().optional(),
  marketCapitalization: z.number().optional(),
});

export function normalizeProfile(raw: unknown) {
  const p = ProfileSchema.parse(raw ?? {});
  return {
    name: p.name,
    industry: p.finnhubIndustry ?? "Other",
    sector: sectorOf(p.finnhubIndustry),
    marketCap: p.marketCapitalization ? p.marketCapitalization * 1e6 : undefined,
  };
}

const RecSchema = z.array(
  z.object({
    symbol: z.string(),
    period: z.string(),
    strongBuy: z.number(),
    buy: z.number(),
    hold: z.number(),
    sell: z.number(),
    strongSell: z.number(),
  }),
);

export function normalizeRecommendations(raw: unknown): RecTrend[] {
  return RecSchema.parse(raw ?? []).sort((a, b) => b.period.localeCompare(a.period));
}

const NewsSchema = z.array(
  z.object({
    id: z.union([z.number(), z.string()]),
    related: z.string().optional(),
    headline: z.string(),
    source: z.string(),
    datetime: z.number(),
    url: z.string().default(""),
    summary: z.string().default(""),
  }),
);

export function normalizeNews(raw: unknown, symbol: string): NewsItem[] {
  return NewsSchema.parse(raw ?? []).map((n) => ({
    id: String(n.id),
    symbol,
    headline: n.headline,
    source: n.source,
    datetime: n.datetime * 1000,
    url: n.url,
    summary: n.summary,
  }));
}

const InsiderSchema = z.object({
  data: z
    .array(
      z.object({
        name: z.string().default(""),
        change: z.number().nullable().optional(),
        transactionDate: z.string().nullable().optional(),
        filingDate: z.string().nullable().optional(),
        transactionPrice: z.number().nullable().optional(),
        transactionCode: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

export function normalizeInsiders(raw: unknown, symbol: string): InsiderTxn[] {
  return InsiderSchema.parse(raw ?? {})
    .data.filter((t) => (t.transactionCode === "P" || t.transactionCode === "S") && t.change)
    .map((t) => ({
      symbol,
      name: t.name,
      date: (t.transactionDate || t.filingDate || "").slice(0, 10),
      shares: t.change ?? 0,
      price: t.transactionPrice ?? 0,
      code: t.transactionCode as "P" | "S",
    }))
    .filter((t) => t.date);
}
