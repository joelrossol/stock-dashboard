/** Raw Finnhub JSON → domain types. */
import { z } from "zod";
import type { EarningsEvent, NewsItem, RecTrend } from "@/lib/data/types";

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
};

export function sectorOf(industry: string | undefined): string {
  if (!industry) return "Other";
  return SECTOR_OF_INDUSTRY[industry] ?? industry;
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
