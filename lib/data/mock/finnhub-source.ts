/** Sample implementation of the Finnhub endpoints, Finnhub-shaped. */
import { addDays, etToEpoch } from "@/lib/dates";
import type { FinnhubSource } from "@/lib/data/source";
import { hashString, mulberry32 } from "./prng";
import { findMock, UNIVERSE } from "./universe";
import { getMockWorld } from "./world";

/** Calendar days from the session date to the next report. */
const EARNINGS_IN: Record<string, [number, "bmo" | "amc"]> = {
  NVDA: [6, "amc"],
  DIS: [10, "bmo"],
  TGT: [12, "bmo"],
  CRM: [19, "amc"],
  ADBE: [33, "amc"],
  AVGO: [35, "amc"],
  COST: [41, "amc"],
  SNOW: [20, "amc"],
};

function earningsOffset(symbol: string): [number, "bmo" | "amc"] {
  if (EARNINGS_IN[symbol]) return EARNINGS_IN[symbol];
  const h = hashString(symbol);
  return [45 + (h % 45), h % 2 ? "amc" : "bmo"];
}

const HEADLINES = [
  (s: string, n: string) => `${n} shares active as traders weigh sector rotation`,
  (s: string) => `What options pricing implies for ${s} into the next month`,
  (s: string, n: string) => `${n}: three numbers to watch this quarter`,
  (s: string) => `${s} added to more model portfolios, survey finds`,
  (s: string, n: string) => `Analysts revisit price targets on ${n}`,
];

export function createMockFinnhubSource(): FinnhubSource {
  return {
    async earningsCalendar(from, to) {
      const asOf = getMockWorld().asOf;
      const earningsCalendar = UNIVERSE.filter((u) => u.assetType === "EQUITY")
        .map((u) => {
          const [days, hour] = earningsOffset(u.symbol);
          const date = addDays(asOf, days);
          const eps = u.pe ? Math.round((u.price / u.pe / 4) * 100) / 100 : null;
          return { date, epsActual: null, epsEstimate: eps, hour, quarter: 4, revenueActual: null, revenueEstimate: null, symbol: u.symbol, year: Number(date.slice(0, 4)) };
        })
        .filter((e) => e.date >= from && e.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date));
      return { earningsCalendar };
    },

    async profile(symbol) {
      const u = findMock(symbol);
      if (!u) return {};
      return {
        country: "US",
        currency: "USD",
        exchange: "NASDAQ NMS - GLOBAL MARKET",
        ipo: "1999-01-22",
        marketCapitalization: (u.marketCapB ?? 0) * 1000,
        name: u.name,
        shareOutstanding: u.marketCapB ? (u.marketCapB * 1000) / u.price : 0,
        ticker: symbol,
        weburl: "",
        logo: "",
        finnhubIndustry: u.industry,
      };
    },

    async recommendations(symbol) {
      const u = findMock(symbol);
      if (!u || u.assetType !== "EQUITY") return [];
      const asOf = getMockWorld().asOf;
      const rng = mulberry32(hashString(`${symbol}:recs`));
      const base = { strongBuy: 6 + Math.floor(rng() * 14), buy: 10 + Math.floor(rng() * 14), hold: 6 + Math.floor(rng() * 12), sell: Math.floor(rng() * 3), strongSell: Math.floor(rng() * 2) };
      const [y, m] = asOf.split("-").map(Number);
      return Array.from({ length: 4 }, (_, k) => {
        const d = new Date(Date.UTC(y, m - 1 - k, 1)).toISOString().slice(0, 10);
        let r = { ...base };
        if (symbol === "UNH") r = k === 0 ? { strongBuy: 4, buy: 9, hold: 14, sell: 4, strongSell: 1 } : { strongBuy: 9, buy: 14, hold: 8, sell: 1, strongSell: 0 };
        else r = { ...r, buy: Math.max(0, r.buy - (k % 2)), hold: r.hold + (k % 2) };
        return { ...r, period: d, symbol };
      });
    },

    async news(symbol) {
      const u = findMock(symbol);
      if (!u) return [];
      const asOf = getMockWorld().asOf;
      const rng = mulberry32(hashString(`${symbol}:news`));
      return Array.from({ length: 3 }, (_, k) => {
        const tpl = HEADLINES[(hashString(symbol) + k) % HEADLINES.length];
        const date = addDays(asOf, -Math.floor(k * 1.7 + rng() * 1.5));
        const dt = etToEpoch(date, 8 + Math.floor(rng() * 9), Math.floor(rng() * 60));
        return {
          category: "company",
          datetime: Math.floor(dt / 1000),
          headline: tpl(symbol, u.name.replace(/ (Inc|Corp|Co|plc ADR|Holdings Inc|Platforms Inc|Group Inc)\.?$/, "")),
          id: hashString(`${symbol}:${k}`),
          image: "",
          related: symbol,
          source: "Sample feed",
          summary: "Sample headline generated for the demo dashboard. Live mode will show real Finnhub company news here.",
          url: "",
        };
      }).sort((a, b) => b.datetime - a.datetime);
    },
  };
}

