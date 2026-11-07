/**
 * Loads everything the app needs into one PortfolioData object.
 * Sources return API-shaped JSON; normalizers produce domain types.
 *
 * Mode: DATA_MODE=mock forces sample data. Otherwise ("auto", the default, or
 * "live") the app uses live Schwab data whenever you're connected, and falls
 * back to sample data with a notice when you aren't.
 */
import "server-only";
import { addDays, etDate, etToEpoch, isWeekend, sessionOnOrBefore } from "@/lib/dates";
import { after } from "next/server";
import { createLiveFinnhubSource } from "@/lib/data/finnhub/client";
import { createEmptyFinnhubSource } from "@/lib/data/finnhub/empty";
import { normalizeEarnings, normalizeNews, normalizeProfile, normalizeRecommendations } from "@/lib/data/finnhub/normalize";
import { createMockFinnhubSource } from "@/lib/data/mock/finnhub-source";
import { createMockSchwabSource } from "@/lib/data/mock/schwab-source";
import { getMockWorld, mockAsOf } from "@/lib/data/mock/world";
import { SchwabAuthError, schwabStatus, type SchwabStatus } from "@/lib/data/schwab/auth";
import { clearSchwabCache, createLiveSchwabSource } from "@/lib/data/schwab/client";
import {
  normalizeAccounts,
  normalizePriceHistory,
  normalizeQuotes,
  normalizeTransactions,
  type AccountOverrides,
} from "@/lib/data/schwab/normalize";
import type { FinnhubSource, SchwabSource } from "@/lib/data/source";
import type { Bar, Connection, Instrument, NewsItem, PortfolioData, RecTrend } from "@/lib/data/types";
import { getDataModePref, listSchwabTransactions, listSnapshots, readSetting, upsertSchwabTransactions, upsertSnapshots, writeSetting } from "@/lib/db/queries";

const LIVE_TTL_MS = 60_000;

let mockCache: { key: string; data: Promise<PortfolioData> } | null = null;
let liveCache: { key: string; at: number; data: Promise<PortfolioData> } | null = null;

export function clearLiveCache() {
  liveCache = null;
  clearSchwabCache();
}

/** The Settings toggle wins; DATA_MODE in .env.local is only the default. */
async function requestedMode(): Promise<Connection["requested"]> {
  const pref = await getDataModePref();
  if (pref) return pref;
  const m = process.env.DATA_MODE;
  return m === "mock" || m === "live" ? m : "auto";
}

export async function loadPortfolioData(overrides: AccountOverrides = {}, extraSymbols: string[] = []): Promise<PortfolioData> {
  const requested = await requestedMode();
  const status = await schwabStatus();
  const symbolsKey = [...extraSymbols].sort().join(",");

  if (requested !== "mock" && status.connected) {
    const key = `${JSON.stringify(overrides)}|${symbolsKey}`;
    if (!liveCache || liveCache.key !== key || Date.now() - liveCache.at > LIVE_TTL_MS) {
      const data = buildLive(overrides, extraSymbols, { requested, status });
      liveCache = { key, at: Date.now(), data };
      data.catch(() => {
        if (liveCache?.data === data) liveCache = null;
      });
    }
    try {
      return await liveCache.data;
    } catch (e) {
      const notice = e instanceof SchwabAuthError && e.code === "expired" ? "expired" : "error";
      return loadMock(overrides, symbolsKey, { requested, status, notice, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const notice: Connection["notice"] = requested === "mock" ? undefined : !status.configured ? "not-configured" : status.expired ? "expired" : "not-connected";
  return loadMock(overrides, symbolsKey, { requested, status, notice });
}

function loadMock(overrides: AccountOverrides, symbolsKey: string, connection: Connection): Promise<PortfolioData> {
  const asOf = mockAsOf();
  getMockWorld(asOf);
  const key = `${asOf}|${JSON.stringify(overrides)}|${symbolsKey}|${connection.notice ?? ""}`;
  if (mockCache?.key === key) return mockCache.data;
  const data = build(createMockSchwabSource(), createMockFinnhubSource(), asOf, overrides, [], connection);
  mockCache = { key, data };
  data.catch(() => {
    if (mockCache?.key === key) mockCache = null;
  });
  return data;
}

// ─── Sample data ──────────────────────────────────────────────────────

async function build(schwab: SchwabSource, finnhub: FinnhubSource, asOf: string, overrides: AccountOverrides, extraSymbols: string[], connection: Connection): Promise<PortfolioData> {
  const [nums, prefs, accts] = await Promise.all([schwab.accountNumbers(), schwab.userPreference(), schwab.accounts()]);
  const { accounts, positions } = normalizeAccounts(nums, prefs, accts, overrides);
  const idByNumber = new Map(accounts.map((a) => [a.accountNumber, a.id]));

  const start = addDays(asOf, -1100);
  const rawTxns = await Promise.all(accounts.map((a) => schwab.transactions(a.id, `${start}T00:00:00.000Z`, `${asOf}T23:59:59.000Z`)));
  const transactions = rawTxns.flatMap((r) => normalizeTransactions(r, idByNumber)).sort((a, b) => a.time.localeCompare(b.time));

  const held = new Set(positions.map((p) => p.symbol));
  const universe = new Set<string>(["SPY", ...held, ...extraSymbols]);
  for (const t of transactions) if (t.symbol) universe.add(t.symbol);
  const { UNIVERSE } = await import("@/lib/data/mock/universe");
  for (const u of UNIVERSE) universe.add(u.symbol);
  const symbols = [...universe].sort();

  const quotes = normalizeQuotes(await schwab.quotes(symbols));
  const daily: Record<string, Bar[]> = {};
  const intraday: Record<string, Bar[]> = {};
  await Promise.all(
    symbols.map(async (s) => {
      daily[s] = normalizePriceHistory(await schwab.priceHistory(s, { periodType: "year", period: 3, frequencyType: "daily", frequency: 1 }));
      intraday[s] = normalizePriceHistory(await schwab.priceHistory(s, { periodType: "day", period: 5, frequencyType: "minute", frequency: 5 }));
    }),
  );

  const { instruments, recommendations, news } = await reference(finnhub, symbols, quotes, positions, held, asOf);
  const earnings = normalizeEarnings(await finnhub.earningsCalendar(asOf, addDays(asOf, 90)));

  return { mode: "mock", asOf, accounts, positions, transactions, quotes, daily, intraday, instruments, earnings, news, recommendations, universe: symbols.filter((s) => s !== "SPY"), connection };
}

async function reference(
  finnhub: FinnhubSource,
  symbols: string[],
  quotes: PortfolioData["quotes"],
  positions: PortfolioData["positions"],
  held: Set<string>,
  asOf: string,
  etfHint: Set<string> = new Set(),
) {
  const instruments: Record<string, Instrument> = {};
  const recommendations: Record<string, RecTrend[]> = {};
  const news: NewsItem[] = [];
  const posType = new Map(positions.map((p) => [p.symbol, p.assetType]));
  await Promise.all(
    symbols.map(async (s) => {
      const q = quotes[s];
      const prof = normalizeProfile(await finnhub.profile(s));
      const isEtf = posType.get(s) === "ETF" || etfHint.has(s) || prof.sector === "Broad market" || s === "SPY";
      const known = prof.industry && prof.industry !== "Other";
      instruments[s] = {
        symbol: s,
        name: q?.name ?? prof.name ?? s,
        assetType: isEtf ? "ETF" : posType.get(s) === "OTHER" ? "OTHER" : "EQUITY",
        sector: isEtf ? "Broad market" : known ? prof.sector : "Unclassified",
        industry: isEtf ? "ETF" : known ? prof.industry : "Unclassified",
        marketCap: prof.marketCap,
      };
      if (!isEtf && held.has(s)) recommendations[s] = normalizeRecommendations(await finnhub.recommendations(s));
      if (held.has(s) && !isEtf) news.push(...normalizeNews(await finnhub.news(s, addDays(asOf, -7), asOf), s));
    }),
  );
  return { instruments, recommendations, news: news.sort((a, b) => b.datetime - a.datetime) };
}

// ─── Live Schwab data ─────────────────────────────────────────────────

/** Fetch recent transactions every load; reach further back once a day. Everything is stored. */
async function syncTransactions(schwab: SchwabSource, numbers: { accountNumber: string; hashValue: string }[]) {
  const today = etDate(new Date());
  const lastBackfill = await readSetting<string>("schwab_txn_backfill", "");
  const windows: [string, string, boolean][] = [[addDays(today, -89), today, true]];
  if (lastBackfill !== today) {
    for (let k = 0; k < 3; k++) windows.push([addDays(today, -365 * (k + 1)), addDays(today, k === 0 ? -90 : -365 * k - 1), false]);
  }
  const rows: { activityId: string; accountNumber: string; time: string; json: string }[] = [];
  for (const n of numbers) {
    for (const [start, end, required] of windows) {
      try {
        const raw = await schwab.transactions(n.hashValue, start, end);
        for (const r of (Array.isArray(raw) ? raw : []) as { activityId?: unknown; accountNumber?: string; time?: string }[]) {
          if (r.activityId == null || !r.time) continue;
          rows.push({ activityId: String(r.activityId), accountNumber: r.accountNumber ?? n.accountNumber, time: r.time, json: JSON.stringify(r) });
        }
      } catch (e) {
        if (required) throw e;
        break; // older history isn't available; stop reaching back for this account
      }
    }
  }
  await upsertSchwabTransactions(rows);
  if (lastBackfill !== today) await writeSetting("schwab_txn_backfill", today);
}

interface RawQuote {
  assetMainType?: string;
  assetSubType?: string;
  quote?: { lastPrice?: number; openPrice?: number; highPrice?: number; lowPrice?: number; totalVolume?: number; tradeTime?: number; quoteTime?: number };
}

/** Make sure the daily series ends with today's bar, using the live quote. */
function patchToday(bars: Bar[], q: RawQuote | undefined): Bar[] {
  const p = q?.quote;
  if (!p?.lastPrice || !(p.tradeTime || p.quoteTime)) return bars;
  const date = etDate(new Date(p.tradeTime || p.quoteTime!));
  if (isWeekend(date)) return bars;
  const last = bars.at(-1);
  const bar: Bar = {
    t: etToEpoch(date, 1, 0),
    date,
    open: p.openPrice || p.lastPrice,
    high: Math.max(p.highPrice || p.lastPrice, p.lastPrice),
    low: Math.min(p.lowPrice || p.lastPrice, p.lastPrice),
    close: p.lastPrice,
    volume: p.totalVolume ?? 0,
  };
  if (!last || date > last.date) return [...bars, bar];
  if (date === last.date) return [...bars.slice(0, -1), { ...last, close: p.lastPrice, high: Math.max(last.high, bar.high), low: Math.min(last.low, bar.low), volume: Math.max(last.volume, bar.volume) }];
  return bars;
}

async function buildLive(overrides: AccountOverrides, extraSymbols: string[], conn: { requested: Connection["requested"]; status: SchwabStatus }): Promise<PortfolioData> {
  const schwab = createLiveSchwabSource();

  const [nums, prefs, accts] = await Promise.all([schwab.accountNumbers(), schwab.userPreference(), schwab.accounts()]);
  const { accounts, positions } = normalizeAccounts(nums, prefs, accts, overrides);
  const idByNumber = new Map(accounts.map((a) => [a.accountNumber, a.id]));

  await syncTransactions(schwab, nums as { accountNumber: string; hashValue: string }[]);
  const transactions = normalizeTransactions(await listSchwabTransactions(), idByNumber).filter((t) => accounts.some((a) => a.id === t.accountId));

  const held = new Set(positions.map((p) => p.symbol));
  const universe = new Set<string>(["SPY", ...held, ...extraSymbols]);
  for (const t of transactions) if (t.symbol) universe.add(t.symbol);
  const symbols = [...universe].filter((s) => /^[A-Z0-9.$/\-]{1,12}$/.test(s)).sort();

  const rawQuotes = (await schwab.quotes(symbols)) as Record<string, unknown>;
  const clean: Record<string, RawQuote> = {};
  for (const [k, v] of Object.entries(rawQuotes)) if (v && typeof v === "object" && "quote" in v) clean[k] = v as RawQuote;
  const quotes = normalizeQuotes(clean);
  const charted = Object.keys(clean).filter((s) => ["EQUITY", "MUTUAL_FUND", "INDEX"].includes(clean[s].assetMainType ?? "EQUITY"));
  const etfHint = new Set(Object.keys(clean).filter((s) => clean[s].assetSubType === "ETF"));

  const daily: Record<string, Bar[]> = {};
  const intraday: Record<string, Bar[]> = {};
  await Promise.all(
    charted.map(async (s) => {
      try {
        daily[s] = patchToday(normalizePriceHistory(await schwab.priceHistory(s, { periodType: "year", period: 3, frequencyType: "daily", frequency: 1 })), clean[s]);
      } catch {
        daily[s] = [];
      }
      if (held.has(s) || s === "SPY") {
        try {
          intraday[s] = normalizePriceHistory(await schwab.priceHistory(s, { periodType: "day", period: 5, frequencyType: "minute", frequency: 5 }));
        } catch {
          intraday[s] = [];
        }
      }
    }),
  );
  if (!daily.SPY?.length) throw new Error("Couldn't load S&P 500 (SPY) price history from Schwab.");
  const asOf = daily.SPY.at(-1)?.date ?? sessionOnOrBefore(etDate(new Date()));

  await upsertSnapshots(accounts.map((a) => ({ accountId: a.id, date: asOf, value: a.liquidationValue, cash: a.cash, source: "snapshot" })));
  const snapshots = await listSnapshots();

  const finnhubKey = process.env.FINNHUB_API_KEY?.trim();
  const live = finnhubKey ? createLiveFinnhubSource(finnhubKey, { budgetMs: 2500, symbols }) : null;
  const finnhub = live ?? createEmptyFinnhubSource();
  // Earnings first: one call covers every symbol.
  const earnings = normalizeEarnings(await finnhub.earningsCalendar(asOf, addDays(asOf, 90)));
  const { instruments, recommendations, news } = await reference(finnhub, symbols, quotes, positions, held, asOf, etfHint);
  if (live) {
    try {
      after(() => live.drain()); // finish anything that didn't fit in this request's time budget
    } catch {
      void live.drain();
    }
  }

  return {
    mode: "live",
    asOf,
    accounts,
    positions,
    transactions,
    quotes,
    daily,
    intraday,
    instruments,
    earnings,
    news,
    recommendations,
    universe: symbols.filter((s) => s !== "SPY"),
    connection: { requested: conn.requested, status: conn.status },
    snapshots,
  };
}
