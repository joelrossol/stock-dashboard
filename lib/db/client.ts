import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { WATCHLIST_SEED } from "@/lib/data/mock/universe";
import * as schema from "./schema";

/** Idempotent schema bootstrap — works for a local file and for Turso. */
const BOOTSTRAP = [
  `CREATE TABLE IF NOT EXISTS watchlists (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, position INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS watchlist_items (id INTEGER PRIMARY KEY AUTOINCREMENT, list_id INTEGER NOT NULL, symbol TEXT NOT NULL, target_price REAL, note TEXT, added_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS watchlist_items_list_symbol ON watchlist_items (list_id, symbol)`,
  `CREATE TABLE IF NOT EXISTS signal_snoozes (signal_id TEXT PRIMARY KEY, until TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS symbol_mutes (symbol TEXT PRIMARY KEY, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS trade_notes (txn_id TEXT PRIMARY KEY, note TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS account_snapshots (account_id TEXT NOT NULL, date TEXT NOT NULL, value REAL NOT NULL, cash REAL, source TEXT NOT NULL, PRIMARY KEY (account_id, date))`,
  `CREATE TABLE IF NOT EXISTS schwab_transactions (activity_id TEXT PRIMARY KEY, account_number TEXT NOT NULL, time TEXT NOT NULL, json TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS schwab_transactions_account ON schwab_transactions (account_number, time)`,
  `CREATE TABLE IF NOT EXISTS oauth_tokens (provider TEXT PRIMARY KEY, access_token_enc TEXT NOT NULL, refresh_token_enc TEXT NOT NULL, access_expires_at INTEGER NOT NULL, refresh_expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
];

export type DB = LibSQLDatabase<typeof schema>;

let ready: Promise<DB> | null = null;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  return `file:${path.join(dir, "dashboard.db")}`;
}

async function init(): Promise<DB> {
  const client: Client = createClient({ url: databaseUrl(), authToken: process.env.DATABASE_AUTH_TOKEN });
  await client.batch(BOOTSTRAP, "write");
  const count = await client.execute("SELECT COUNT(*) AS n FROM watchlists");
  if (Number(count.rows[0]?.n ?? 0) === 0) {
    const lists = [...new Set(WATCHLIST_SEED.map((w) => w.list))];
    const now = new Date().toISOString();
    await client.batch(
      [
        ...lists.map((name, i) => ({ sql: "INSERT INTO watchlists (name, position) VALUES (?, ?)", args: [name, i] })),
        ...WATCHLIST_SEED.map((w) => ({
          sql: "INSERT INTO watchlist_items (list_id, symbol, target_price, note, added_at) VALUES ((SELECT id FROM watchlists WHERE name = ?), ?, ?, ?, ?)",
          args: [w.list, w.symbol, w.target ?? null, w.note ?? null, now],
        })),
      ],
      "write",
    );
  }
  return drizzle(client, { schema });
}

export function getDb(): Promise<DB> {
  if (!ready) {
    ready = init();
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}
