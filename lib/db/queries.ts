import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/analytics/thresholds";
import type { AccountOverrides } from "@/lib/data/schwab/normalize";
import { getDb } from "./client";
import { accountSnapshots, finnhubCache, oauthTokens, schwabTransactions, settings, signalSnoozes, symbolMutes, tradeNotes, watchlistItems, watchlists } from "./schema";

export interface WatchlistItem {
  symbol: string;
  targetPrice: number | null;
  note: string | null;
  addedAt: string;
}

export interface Watchlist {
  id: number;
  name: string;
  items: WatchlistItem[];
}

export async function getWatchlists(): Promise<Watchlist[]> {
  const db = await getDb();
  const lists = await db.select().from(watchlists).orderBy(asc(watchlists.position), asc(watchlists.id));
  const items = await db.select().from(watchlistItems).orderBy(asc(watchlistItems.id));
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    items: items
      .filter((i) => i.listId === l.id)
      .map((i) => ({ symbol: i.symbol, targetPrice: i.targetPrice, note: i.note, addedAt: i.addedAt })),
  }));
}

export async function addWatchItem(listId: number, symbol: string) {
  const db = await getDb();
  await db
    .insert(watchlistItems)
    .values({ listId, symbol: symbol.toUpperCase(), addedAt: new Date().toISOString() })
    .onConflictDoNothing();
}

export async function removeWatchItem(listId: number, symbol: string) {
  const db = await getDb();
  await db.delete(watchlistItems).where(and(eq(watchlistItems.listId, listId), eq(watchlistItems.symbol, symbol)));
}

export async function setWatchTarget(listId: number, symbol: string, target: number | null) {
  const db = await getDb();
  await db
    .update(watchlistItems)
    .set({ targetPrice: target })
    .where(and(eq(watchlistItems.listId, listId), eq(watchlistItems.symbol, symbol)));
}

export async function createWatchlist(name: string): Promise<number> {
  const db = await getDb();
  const existing = await db.select().from(watchlists);
  const [row] = await db
    .insert(watchlists)
    .values({ name, position: existing.length })
    .onConflictDoNothing()
    .returning({ id: watchlists.id });
  return row?.id ?? existing.find((l) => l.name === name)?.id ?? 0;
}

export interface Suppression {
  snoozes: Map<string, string>;
  mutes: Set<string>;
}

export async function getSuppression(): Promise<Suppression> {
  const db = await getDb();
  const [s, m] = await Promise.all([db.select().from(signalSnoozes), db.select().from(symbolMutes)]);
  return { snoozes: new Map(s.map((r) => [r.signalId, r.until])), mutes: new Set(m.map((r) => r.symbol)) };
}

export async function snoozeSignal(signalId: string, until: string) {
  const db = await getDb();
  await db.insert(signalSnoozes).values({ signalId, until }).onConflictDoUpdate({ target: signalSnoozes.signalId, set: { until } });
}

export async function unsnoozeSignal(signalId: string) {
  const db = await getDb();
  await db.delete(signalSnoozes).where(eq(signalSnoozes.signalId, signalId));
}

export async function muteSymbol(symbol: string) {
  const db = await getDb();
  await db.insert(symbolMutes).values({ symbol, createdAt: new Date().toISOString() }).onConflictDoNothing();
}

export async function unmuteSymbol(symbol: string) {
  const db = await getDb();
  await db.delete(symbolMutes).where(eq(symbolMutes.symbol, symbol));
}

export async function getTradeNotes(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.select().from(tradeNotes);
  return Object.fromEntries(rows.map((r) => [r.txnId, r.note]));
}

export async function saveTradeNote(txnId: string, note: string) {
  const db = await getDb();
  if (!note.trim()) {
    await db.delete(tradeNotes).where(eq(tradeNotes.txnId, txnId));
    return;
  }
  const updatedAt = new Date().toISOString();
  await db.insert(tradeNotes).values({ txnId, note, updatedAt }).onConflictDoUpdate({ target: tradeNotes.txnId, set: { note, updatedAt } });
}

export interface AppSettings {
  thresholds: Thresholds;
  accounts: AccountOverrides;
}

export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function writeSetting(key: string, value: unknown) {
  const db = await getDb();
  const json = JSON.stringify(value);
  await db.insert(settings).values({ key, value: json }).onConflictDoUpdate({ target: settings.key, set: { value: json } });
}

export async function getSettings(): Promise<AppSettings> {
  const [thresholds, accounts] = await Promise.all([
    readSetting<Partial<Thresholds>>("thresholds", {}),
    readSetting<AccountOverrides>("accounts", {}),
  ]);
  return { thresholds: { ...DEFAULT_THRESHOLDS, ...thresholds }, accounts };
}

export async function saveThresholds(t: Partial<Thresholds>) {
  await writeSetting("thresholds", t);
}

export async function saveAccountOverrides(o: AccountOverrides) {
  await writeSetting("accounts", o);
}

// ─── Schwab (Phase 2) ─────────────────────────────────────────────────

export interface StoredTokens {
  accessTokenEnc: string;
  refreshTokenEnc: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  updatedAt: number;
}

export async function loadTokens(provider = "schwab"): Promise<StoredTokens | null> {
  const db = await getDb();
  const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, provider));
  return row ?? null;
}

export async function saveTokens(t: StoredTokens, provider = "schwab") {
  const db = await getDb();
  await db
    .insert(oauthTokens)
    .values({ provider, ...t })
    .onConflictDoUpdate({ target: oauthTokens.provider, set: t });
}

export async function deleteTokens(provider = "schwab") {
  const db = await getDb();
  await db.delete(oauthTokens).where(eq(oauthTokens.provider, provider));
}

export async function upsertSchwabTransactions(rows: { activityId: string; accountNumber: string; time: string; json: string }[]) {
  if (!rows.length) return;
  const db = await getDb();
  for (let i = 0; i < rows.length; i += 200) {
    await db
      .insert(schwabTransactions)
      .values(rows.slice(i, i + 200))
      .onConflictDoUpdate({ target: schwabTransactions.activityId, set: { json: sql`excluded.json`, time: sql`excluded.time` } });
  }
}

export async function listSchwabTransactions(): Promise<unknown[]> {
  const db = await getDb();
  const rows = await db.select().from(schwabTransactions).orderBy(asc(schwabTransactions.time));
  return rows.map((r) => JSON.parse(r.json));
}

export async function upsertSnapshots(rows: { accountId: string; date: string; value: number; cash: number; source: string }[]) {
  if (!rows.length) return;
  const db = await getDb();
  await db
    .insert(accountSnapshots)
    .values(rows)
    .onConflictDoUpdate({ target: [accountSnapshots.accountId, accountSnapshots.date], set: { value: sql`excluded.value`, cash: sql`excluded.cash`, source: sql`excluded.source` } });
}

export async function listSnapshots(): Promise<Record<string, { date: string; value: number }[]>> {
  const db = await getDb();
  const rows = await db.select().from(accountSnapshots).orderBy(asc(accountSnapshots.date));
  const out: Record<string, { date: string; value: number }[]> = {};
  for (const r of rows) (out[r.accountId] ??= []).push({ date: r.date, value: r.value });
  return out;
}

export type DataModePref = "live" | "mock";

export async function getDataModePref(): Promise<DataModePref | null> {
  const v = await readSetting<string | null>("data_mode", null);
  return v === "live" || v === "mock" ? v : null;
}

export async function setDataModePref(mode: DataModePref) {
  await writeSetting("data_mode", mode);
}

export async function loadFinnhubCache(): Promise<Map<string, { json: string; fetchedAt: number }>> {
  const db = await getDb();
  const rows = await db.select().from(finnhubCache);
  return new Map(rows.map((r) => [r.key, { json: r.json, fetchedAt: r.fetchedAt }]));
}

export async function saveFinnhubCache(key: string, json: string, fetchedAt: number) {
  const db = await getDb();
  await db.insert(finnhubCache).values({ key, json, fetchedAt }).onConflictDoUpdate({ target: finnhubCache.key, set: { json, fetchedAt } });
}
