"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { THRESHOLD_FIELDS, type Thresholds } from "@/lib/analytics/thresholds";
import { addDays, etDate } from "@/lib/dates";
import type { TaxTreatment } from "@/lib/data/types";
import {
  addWatchItem,
  createWatchlist,
  muteSymbol,
  removeWatchItem,
  saveAccountOverrides,
  saveThresholds,
  saveTradeNote,
  setWatchTarget,
  snoozeSignal,
  unmuteSymbol,
  unsnoozeSignal,
} from "@/lib/db/queries";
import { SCOPE_COOKIE } from "@/lib/context";
import { requireUser } from "@/lib/auth/server";

const SYMBOL = /^[A-Z.\-]{1,10}$/;

export async function setScopeAction(scope: string) {
  await requireUser();
  const jar = await cookies();
  if (scope === "all") jar.delete(SCOPE_COOKIE);
  else jar.set(SCOPE_COOKIE, scope, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  refresh();
}

export async function addToWatchlistAction(listId: number, symbol: string) {
  await requireUser();
  const s = symbol.trim().toUpperCase();
  if (!SYMBOL.test(s)) return;
  await addWatchItem(listId, s);
  refresh();
}

export async function removeFromWatchlistAction(listId: number, symbol: string) {
  await requireUser();
  await removeWatchItem(listId, symbol);
  refresh();
}

export async function setWatchTargetAction(listId: number, symbol: string, target: number | null) {
  await requireUser();
  const t = target != null && Number.isFinite(target) && target > 0 ? Math.round(target * 100) / 100 : null;
  await setWatchTarget(listId, symbol, t);
  refresh();
}

export async function createWatchlistAction(name: string) {
  await requireUser();
  const n = name.trim().slice(0, 40);
  if (!n) return;
  await createWatchlist(n);
  refresh();
}

export async function snoozeSignalAction(signalId: string, days: number) {
  await requireUser();
  await snoozeSignal(signalId, addDays(etDate(new Date()), Math.max(1, Math.min(90, days))));
  refresh();
}

export async function unsnoozeSignalAction(signalId: string) {
  await requireUser();
  await unsnoozeSignal(signalId);
  refresh();
}

export async function muteSymbolAction(symbol: string) {
  await requireUser();
  await muteSymbol(symbol);
  refresh();
}

export async function unmuteSymbolAction(symbol: string) {
  await requireUser();
  await unmuteSymbol(symbol);
  refresh();
}

export async function saveTradeNoteAction(txnId: string, note: string) {
  await requireUser();
  await saveTradeNote(txnId, note.slice(0, 2000));
  refresh();
}

export async function saveThresholdsAction(formData: FormData) {
  await requireUser();
  const next: Partial<Thresholds> = {};
  for (const f of THRESHOLD_FIELDS) {
    const raw = formData.get(f.key);
    if (raw == null || raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    next[f.key] = f.unit === "%" ? n / 100 : n;
  }
  await saveThresholds(next);
  refresh();
}

export async function resetThresholdsAction() {
  await requireUser();
  await saveThresholds({});
  refresh();
}

export async function saveAccountsAction(formData: FormData) {
  await requireUser();
  const out: Record<string, { name?: string; taxTreatment?: TaxTreatment }> = {};
  const valid: TaxTreatment[] = ["taxable", "tax-deferred", "tax-free"];
  for (const [k, v] of formData.entries()) {
    const m = k.match(/^(name|tax):(\w+)$/);
    if (!m) continue;
    const [, field, num] = m;
    out[num] ??= {};
    if (field === "name" && String(v).trim()) out[num].name = String(v).trim().slice(0, 40);
    if (field === "tax" && valid.includes(v as TaxTreatment)) out[num].taxTreatment = v as TaxTreatment;
  }
  await saveAccountOverrides(out);
  refresh();
}


export async function loadSymbolBarsAction(symbol: string) {
  await requireUser();
  const { loadPortfolioData } = await import("@/lib/data/load");
  const { getSettings, getWatchlists } = await import("@/lib/db/queries");
  const [settings, lists] = await Promise.all([getSettings(), getWatchlists()]);
  const data = await loadPortfolioData(settings.accounts, lists.flatMap((l) => l.items.map((i) => i.symbol)));
  return (data.daily[symbol] ?? []).map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
}

export async function disconnectSchwabAction() {
  await requireUser();
  const { disconnectSchwab } = await import("@/lib/data/schwab/auth");
  const { clearLiveCache } = await import("@/lib/data/load");
  await disconnectSchwab();
  clearLiveCache();
  refresh();
}

export async function refreshDataAction() {
  await requireUser();
  const { clearLiveCache } = await import("@/lib/data/load");
  clearLiveCache();
  refresh();
}

export async function setDataModeAction(mode: "live" | "mock") {
  await requireUser();
  const { setDataModePref } = await import("@/lib/db/queries");
  const { clearLiveCache } = await import("@/lib/data/load");
  await setDataModePref(mode === "live" ? "live" : "mock");
  clearLiveCache();
  refresh();
}
