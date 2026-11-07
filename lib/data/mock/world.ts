/** Builds (once per session date) the full sample world: prices + ledger. */
import { etDate, sessionOnOrBefore, sessionsEndingAt } from "@/lib/dates";
import type { Bar } from "@/lib/data/types";
import { buildLedger, type Ledger } from "./ledger";
import { generatePrices } from "./prices";

export const HISTORY_SESSIONS = 756; // ~3 years

export interface MockWorld {
  asOf: string;
  sessions: string[];
  daily: Record<string, Bar[]>;
  intraday: Record<string, Bar[]>;
  ledger: Ledger;
}

let cache: MockWorld | null = null;

export function mockAsOf(now: Date = new Date()): string {
  return sessionOnOrBefore(etDate(now));
}

export function getMockWorld(asOf: string = mockAsOf()): MockWorld {
  if (cache?.asOf === asOf) return cache;
  const sessions = sessionsEndingAt(asOf, HISTORY_SESSIONS);
  const { daily, intraday } = generatePrices(sessions);
  const ledger = buildLedger(sessions, daily);
  cache = { asOf, sessions, daily, intraday, ledger };
  return cache;
}
