/**
 * Date helpers. Calendar dates are plain "YYYY-MM-DD" strings in US/Eastern
 * market time; arithmetic is done in UTC to avoid DST surprises.
 */

const ET = "America/New_York";
const DAY_MS = 86_400_000;

const etParts = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short",
});

function parts(d: Date) {
  const out: Record<string, string> = {};
  for (const p of etParts.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** Calendar date of an instant in US/Eastern. */
export function etDate(d: Date): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since midnight in US/Eastern. */
export function etMinutes(d: Date): number {
  const p = parts(d);
  return (Number(p.hour) % 24) * 60 + Number(p.minute);
}

export function toUTC(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return fromUTC(toUTC(date) + n * DAY_MS);
}

/** Whole calendar days from a to b (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export function weekday(date: string): number {
  return new Date(toUTC(date)).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const w = weekday(date);
  return w === 0 || w === 6;
}

/** Most recent weekday on or before `date`. */
export function sessionOnOrBefore(date: string): string {
  let d = date;
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

/** Next weekday strictly after `date`. */
export function nextSession(date: string): string {
  let d = addDays(date, 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

/** `n` weekdays ending at `end` (inclusive), oldest first. */
export function sessionsEndingAt(end: string, n: number): string[] {
  const out: string[] = [];
  let d = sessionOnOrBefore(end);
  while (out.length < n) {
    out.push(d);
    d = addDays(d, -1);
    while (isWeekend(d)) d = addDays(d, -1);
  }
  return out.reverse();
}

/** UTC offset of US/Eastern on a date, in minutes (e.g. −300 for EST). */
export function etOffsetMinutes(date: string): number {
  const probe = new Date(toUTC(date) + 17 * 3_600_000);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: ET, timeZoneName: "shortOffset" })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = name?.match(/GMT([+-]\d+)(?::(\d+))?/);
  if (!m) return -300;
  const h = Number(m[1]);
  const mins = Number(m[2] ?? 0);
  return h * 60 + Math.sign(h) * mins;
}

/** Epoch ms for an Eastern wall-clock time on a date. */
export function etToEpoch(date: string, hour: number, minute: number): number {
  return toUTC(date) + (hour * 60 + minute - etOffsetMinutes(date)) * 60_000;
}

export interface MarketStatus {
  open: boolean;
  label: string;
}

export function marketStatus(now: Date): MarketStatus {
  const date = etDate(now);
  const mins = etMinutes(now);
  const OPEN = 9 * 60 + 30;
  const CLOSE = 16 * 60;
  const fmt = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;
  if (!isWeekend(date) && mins >= OPEN && mins < CLOSE) {
    return { open: true, label: `Open · closes in ${fmt(CLOSE - mins)}` };
  }
  if (!isWeekend(date) && mins < OPEN) {
    return { open: false, label: `Closed · opens in ${fmt(OPEN - mins)}` };
  }
  const next = nextSession(date);
  const label = weekday(next) === 1 && weekday(date) !== 0 ? "Closed · opens Monday" : "Closed · opens 9:30 ET";
  return { open: false, label };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function fmtDate(date: string, style: "short" | "medium" | "long" | "month" = "medium"): string {
  const [y, m, d] = date.split("-").map(Number);
  if (style === "short") return `${MONTHS[m - 1]} ${d}`;
  if (style === "month") return `${MONTHS[m - 1]} ’${String(y).slice(2)}`;
  if (style === "long") return `${DAYS[weekday(date)]}, ${MONTHS[m - 1]} ${d}, ${y}`;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function monthLabel(date: string): { month: string; day: string } {
  const [, m, d] = date.split("-").map(Number);
  return { month: MONTHS[m - 1], day: String(d) };
}

export function dayName(date: string): string {
  return DAYS[weekday(date)];
}

export function fmtTimeET(epochMs: number): string {
  const p = parts(new Date(epochMs));
  const h = Number(p.hour) % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${p.minute} ${h < 12 ? "AM" : "PM"}`;
}

export function yearStart(date: string): string {
  return `${date.slice(0, 4)}-01-01`;
}
