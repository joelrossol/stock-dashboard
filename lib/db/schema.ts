import { integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const watchlists = sqliteTable("watchlists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  position: integer("position").notNull().default(0),
});

export const watchlistItems = sqliteTable(
  "watchlist_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listId: integer("list_id").notNull(),
    symbol: text("symbol").notNull(),
    targetPrice: real("target_price"),
    note: text("note"),
    addedAt: text("added_at").notNull(),
  },
  (t) => [uniqueIndex("watchlist_items_list_symbol").on(t.listId, t.symbol)],
);

export const signalSnoozes = sqliteTable("signal_snoozes", {
  signalId: text("signal_id").primaryKey(),
  until: text("until").notNull(), // YYYY-MM-DD
});

export const symbolMutes = sqliteTable("symbol_mutes", {
  symbol: text("symbol").primaryKey(),
  createdAt: text("created_at").notNull(),
});

export const tradeNotes = sqliteTable("trade_notes", {
  txnId: text("txn_id").primaryKey(),
  note: text("note").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON
});

/** Phase 2: daily balance snapshots (snapshot / imported / reconstructed). */
export const accountSnapshots = sqliteTable(
  "account_snapshots",
  {
    accountId: text("account_id").notNull(),
    date: text("date").notNull(),
    value: real("value").notNull(),
    cash: real("cash"),
    source: text("source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.date] })],
);

/** Phase 2: encrypted Schwab OAuth tokens. */
export const oauthTokens = sqliteTable("oauth_tokens", {
  provider: text("provider").primaryKey(),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  accessExpiresAt: integer("access_expires_at").notNull(),
  refreshExpiresAt: integer("refresh_expires_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Phase 2: every transaction ever fetched from Schwab, kept because the API only reaches back so far. */
export const schwabTransactions = sqliteTable("schwab_transactions", {
  activityId: text("activity_id").primaryKey(),
  accountNumber: text("account_number").notNull(),
  time: text("time").notNull(),
  json: text("json").notNull(),
});
