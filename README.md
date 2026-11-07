# Portfolio — personal stock dashboard

A dark, dense dashboard for Schwab accounts: net worth across accounts, cross-account holdings, a watchlist with sparkline tiles, trade hindsight and grading, performance vs the S&P, and rule-based insights.

**Status: Phase 2 (live Schwab) built.** Without a Schwab connection the app runs on realistic sample data shaped exactly like Schwab API responses; once you connect, it switches to your live accounts automatically.

## Connect your Schwab account

1. In [developer.schwab.com](https://developer.schwab.com), open your app and set the callback URL to exactly `https://127.0.0.1:3000/api/auth/schwab/callback`.
2. Put your App Key and Secret in `.env.local` (`SCHWAB_APP_KEY`, `SCHWAB_APP_SECRET`). `TOKEN_ENCRYPTION_KEY` is already generated there.
3. Start the HTTPS dev server: `npm run dev`. Open https://127.0.0.1:3000 and accept the one-time certificate warning (it's a local self-signed certificate).
4. Settings → **Connect Schwab**, then sign in on Schwab's site.

Tokens are encrypted in the local database. Access tokens refresh automatically; Schwab requires signing in again every 7 days, and the top bar warns you two days ahead. Live data refreshes every minute, every transaction fetched is stored (the API only reaches back about a year), and each day's balances are recorded so your history becomes exact over time.

## Run it

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev        # https://127.0.0.1:3000 (accept the one-time certificate warning)
```

No keys are needed in sample mode. A local SQLite file is created at `data/dashboard.db` for watchlists, snoozes, notes, and settings.

```bash
npm test           # analytics + scenario tests (Vitest)
npm run typecheck
npm run lint
npm run build
```

## Pages

| Page | What it answers |
|---|---|
| Overview | How am I doing right now? KPIs, net-worth chart with S&P overlay, today's breadth ring, insights, accounts, heatmap, upcoming events, top holdings |
| Holdings | What do I own across every account? Sortable table, per-account split, sector / asset / account allocation, concentration |
| Watchlist | Tiles or table, 1D/1M/3M sparklines, 52-week range, earnings chips, target prices |
| Trades | Journal with A–F grades; drawer shows "if you'd held / if you'd sold", grades at 30/90/180 days, FIFO lots, and a thesis note |
| Performance | Time-weighted and money-weighted returns, the "same deposits in the S&P" shadow, attribution, correlation, stress test, dividends, tax view |
| Insights | Every signal with its numbers and reasons; snooze or mute |
| Stock detail | `/symbol/NVDA` — price chart with SMAs and your trades, position, stats, earnings, analysts, signals, news |
| Settings | Connection status, account names and tax treatment, every signal threshold |

The account switcher in the top bar (or ⌘K) re-scopes every page to one account.

## How it fits together

```
lib/data/mock/*        sample world: prices (with a market factor), ledger, Schwab- and Finnhub-shaped responses
lib/data/schwab/*      zod schemas + normalizers (shared by sample and live sources)
lib/data/finnhub/*     earnings, profiles, recommendations, news normalizers
lib/data/load.ts       loads everything into one PortfolioData object
lib/analytics/*        indicators, metrics + trend score, signals, returns, risk, trades, history rebuild
lib/model.ts           PortfolioData + scope + settings → everything the pages render
lib/db/*               SQLite / Turso via Drizzle (watchlists, snoozes, notes, settings)
components/charts/*    custom SVG charts (d3-shape + Motion): area, price, sparkline, breadth ring, treemap
```

The sample source returns raw JSON in Schwab's own format and runs through the same normalizers as live data, so switching to live is a source swap, not a rewrite.

Signals are mechanical rules with transparent thresholds (Settings → Signal thresholds). They're not investment advice.

## Login

The whole app sits behind an email and password login. A server-side proxy turns away anyone without a valid session before any page, API route, or action runs, and every data load and action checks the session again. Sessions are signed cookies (HttpOnly, Secure). They end after 12 hours idle or 7 days total. Five wrong passwords lock sign-in for 15 minutes. The site sends noindex headers and a disallow-all `robots.txt`.

Change the login any time with `npm run set-password` (input is hidden). Only a salted scrypt hash is stored, in `.env.local` as `AUTH_EMAIL`, `AUTH_PASSWORD_HASH`, and `AUTH_SECRET`. Restart the server after changing it.

## Privacy and secrets

This repo contains code and invented sample data only. Your real data and keys stay out of git:

- **Keys and passwords** go in `.env.local`, which is gitignored (every `.env*` file is, except `.env.example`, which has empty placeholders).
- **Your database** (`data/dashboard.db`: watchlists, notes, settings, and later your encrypted Schwab tokens and balance snapshots) is gitignored.
- **Sample accounts** in `lib/data/mock/` use made-up account numbers, balances, and trades. They don't belong to anyone.
- **Live account data** (Phase 2+) is fetched at runtime and stored only in your database, never in source files.

A pre-commit hook (`.githooks/pre-commit`, enabled automatically by `npm install`) blocks any commit that includes `.env*` files, certificates, the database, or any file containing a value from `.env.local`. Run it on demand with `npm run check:secrets`.

## Next phases

1. **Schwab CSV import**: month-end balances and older transactions for exact long-range history.
2. **Finnhub**: earnings, analyst ratings, sectors, news (free tier).
3. **Vercel**: Turso database, password gate, daily cron snapshot.

See `.env.example` for the settings each phase uses.
