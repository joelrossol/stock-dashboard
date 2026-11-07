/**
 * Live Schwab Trader API client. Returns raw API JSON (same contract as the
 * sample source). Keeps well under Schwab's ~120 requests/minute with a
 * concurrency cap + sliding-window limiter, and caches price history.
 */
import "server-only";
import type { PriceHistoryParams, SchwabSource } from "@/lib/data/source";
import { getAccessToken, invalidateAccessToken } from "./auth";

const TRADER = "https://api.schwabapi.com/trader/v1";
const MARKET = "https://api.schwabapi.com/marketdata/v1";

const MAX_CONCURRENT = 6;
const MAX_PER_MINUTE = 100;

let active = 0;
const queue: (() => void)[] = [];
const recent: number[] = [];

async function slot(): Promise<() => void> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => queue.push(r));
  active++;
  for (;;) {
    const now = Date.now();
    while (recent.length && now - recent[0] > 60_000) recent.shift();
    if (recent.length < MAX_PER_MINUTE) break;
    await new Promise((r) => setTimeout(r, 60_000 - (now - recent[0]) + 25));
  }
  recent.push(Date.now());
  return () => {
    active--;
    queue.shift()?.();
  };
}

export class SchwabApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function get(base: string, path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<unknown> {
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  for (let attempt = 0; attempt < 4; attempt++) {
    const release = await slot();
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${await getAccessToken()}`, Accept: "application/json" }, cache: "no-store" });
    } finally {
      release();
    }
    if (res.ok) return res.status === 204 ? null : res.json();
    if (res.status === 401 && attempt === 0) {
      await invalidateAccessToken();
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 800 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const text = await res.text().catch(() => "");
    throw new SchwabApiError(`Schwab ${res.status} on ${path}: ${text.slice(0, 200)}`, res.status);
  }
  throw new SchwabApiError(`Schwab kept failing on ${path}`, 503);
}

// ─── Small TTL cache ──────────────────────────────────────────────────

const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cached(key: string, ttlMs: number, load: () => Promise<unknown>): Promise<unknown> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

export function clearSchwabCache() {
  cache.clear();
}

const isoMillis = (d: string, end = false) => `${d}T${end ? "23:59:59.000" : "00:00:00.000"}Z`;

export function createLiveSchwabSource(): SchwabSource {
  return {
    accountNumbers: () => cached("accountNumbers", 6 * 3600_000, () => get(TRADER, "/accounts/accountNumbers")),
    userPreference: () => cached("userPreference", 3600_000, () => get(TRADER, "/userPreference")),
    accounts: () => get(TRADER, "/accounts", { fields: "positions" }),

    transactions: (accountHash, startDate, endDate) =>
      get(TRADER, `/accounts/${encodeURIComponent(accountHash)}/transactions`, {
        startDate: startDate.length === 10 ? isoMillis(startDate) : startDate,
        endDate: endDate.length === 10 ? isoMillis(endDate, true) : endDate,
        types: "TRADE,RECEIVE_AND_DELIVER,DIVIDEND_OR_INTEREST,ACH_RECEIPT,ACH_DISBURSEMENT,CASH_RECEIPT,CASH_DISBURSEMENT,ELECTRONIC_FUND,WIRE_OUT,WIRE_IN,JOURNAL",
      }),

    async quotes(symbols) {
      const out: Record<string, unknown> = {};
      for (let i = 0; i < symbols.length; i += 100) {
        const chunk = symbols.slice(i, i + 100);
        const res = (await get(MARKET, "/quotes", { symbols: chunk.join(","), fields: "quote,fundamental,reference", indicative: false })) as Record<string, unknown>;
        Object.assign(out, res);
      }
      return out;
    },

    priceHistory(symbol, p: PriceHistoryParams) {
      const intraday = p.frequencyType === "minute";
      const key = `ph:${symbol}:${p.periodType}:${p.period}:${p.frequencyType}:${p.frequency}`;
      return cached(key, intraday ? 2 * 60_000 : 6 * 3600_000, () =>
        get(MARKET, "/pricehistory", {
          symbol,
          periodType: p.periodType,
          period: p.period,
          frequencyType: p.frequencyType,
          frequency: p.frequency,
          startDate: p.startDate,
          endDate: p.endDate,
          needExtendedHoursData: false,
          needPreviousClose: true,
        }),
      );
    },

    searchInstruments: (query) => get(MARKET, "/instruments", { symbol: query.toUpperCase(), projection: "symbol-search" }),
  };
}
