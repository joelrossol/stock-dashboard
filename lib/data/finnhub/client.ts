/**
 * Live Finnhub client (free tier: ~60 calls/minute). Results are cached in
 * memory and in the database, so restarts don't refetch everything. Each page
 * load spends at most `budgetMs` waiting on Finnhub; anything still missing is
 * queued and fetched after the response via `drain()`.
 */
import "server-only";
import type { FinnhubSource } from "@/lib/data/source";
import { loadFinnhubCache, saveFinnhubCache } from "@/lib/db/queries";

const BASE = "https://finnhub.io/api/v1";
const PER_MINUTE = 50;
const CONCURRENCY = 4;
const TTL: Record<string, number> = {
  profile: 7 * 86_400_000,
  rec: 86_400_000,
  news: 3_600_000,
  earnings: 6 * 3_600_000,
};

const memory = new Map<string, { json: string; fetchedAt: number }>();
let loaded: Promise<void> | null = null;
const recent: number[] = [];
let active = 0;
const waiters: (() => void)[] = [];
const queued = new Map<string, () => Promise<unknown>>();

function loadOnce() {
  loaded ??= loadFinnhubCache()
    .then((m) => {
      for (const [k, v] of m) if (!memory.has(k)) memory.set(k, v);
    })
    .catch(() => undefined);
  return loaded;
}

async function slot(): Promise<() => void> {
  if (active >= CONCURRENCY) await new Promise<void>((r) => waiters.push(r));
  active++;
  for (;;) {
    const now = Date.now();
    while (recent.length && now - recent[0] > 60_000) recent.shift();
    if (recent.length < PER_MINUTE) break;
    await new Promise((r) => setTimeout(r, 60_000 - (now - recent[0]) + 25));
  }
  recent.push(Date.now());
  return () => {
    active--;
    waiters.shift()?.();
  };
}

async function request(apiKey: string, path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 3; attempt++) {
    const release = await slot();
    let res: Response;
    try {
      res = await fetch(url, { headers: { "X-Finnhub-Token": apiKey }, cache: "no-store" });
    } finally {
      release();
    }
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`Finnhub ${res.status} on ${path}`);
  }
  throw new Error(`Finnhub kept failing on ${path}`);
}

export type LiveFinnhubSource = FinnhubSource & { drain(limit?: number): Promise<void> };

export function createLiveFinnhubSource(apiKey: string, opts: { budgetMs: number; symbols: string[] }): LiveFinnhubSource {
  const deadline = Date.now() + opts.budgetMs;
  const universe = new Set(opts.symbols);

  async function cached<T>(kind: string, key: string, fallback: T, load: () => Promise<T>): Promise<T> {
    await loadOnce();
    const hit = memory.get(key);
    const fresh = hit && Date.now() - hit.fetchedAt < TTL[kind];
    if (hit && fresh) return JSON.parse(hit.json) as T;
    const fetchAndStore = async () => {
      const value = await load();
      const json = JSON.stringify(value);
      const at = Date.now();
      memory.set(key, { json, fetchedAt: at });
      await saveFinnhubCache(key, json, at).catch(() => undefined);
      return value;
    };
    if (Date.now() < deadline) {
      try {
        return await fetchAndStore();
      } catch {
        return hit ? (JSON.parse(hit.json) as T) : fallback;
      }
    }
    queued.set(key, fetchAndStore);
    return hit ? (JSON.parse(hit.json) as T) : fallback;
  }

  return {
    earningsCalendar: (from, to) =>
      cached("earnings", `earnings:${from}:${to}`, { earningsCalendar: [] }, async () => {
        const raw = (await request(apiKey, "/calendar/earnings", { from, to })) as { earningsCalendar?: { symbol: string }[] };
        return { earningsCalendar: (raw.earningsCalendar ?? []).filter((e) => universe.has(e.symbol)) };
      }),
    profile: (symbol) => cached("profile", `profile:${symbol}`, {}, () => request(apiKey, "/stock/profile2", { symbol })),
    recommendations: (symbol) => cached("rec", `rec:${symbol}`, [], () => request(apiKey, "/stock/recommendation", { symbol })),
    news: (symbol, from, to) =>
      cached("news", `news:${symbol}`, [], async () => ((await request(apiKey, "/company-news", { symbol, from, to })) as unknown[]).slice(0, 8)),
    async drain(limit = 80) {
      const jobs = [...queued.entries()].slice(0, limit);
      for (const [k] of jobs) queued.delete(k);
      await Promise.allSettled(jobs.map(([, job]) => job()));
    },
  };
}
