# Portfolio: a private dashboard for your Schwab accounts

See every Schwab account in one place: net worth over time against the S&P 500, holdings combined across accounts, a watchlist, trade history graded with hindsight, and rule-based signals for trends worth a look. It runs on your own computer or your own Vercel project, behind your own login.

It runs on realistic **sample data** until you connect Schwab, so you can try everything in about five minutes before setting up any API keys.

---

## 1. Try it with sample data (5 minutes)

You need [Node.js](https://nodejs.org) 20.9 or newer and Git.

```bash
git clone https://github.com/joelrossol/stock-dashboard.git
cd stock-dashboard
npm install
cp .env.example .env.local
npm run set-password      # choose the email and password you'll sign in with
npm run dev
```

Open **https://127.0.0.1:3000**. Your browser warns about the certificate once: the dev server uses a self-signed certificate made on your machine, so choose *Advanced → Proceed*. Sign in with the email and password you just chose.

You'll see three made-up accounts. None of this data is real.

---

## 2. Connect your Schwab account

### a. Create a Schwab developer app (one time)

1. Sign in at [developer.schwab.com](https://developer.schwab.com) with your normal Schwab login.
2. **Dashboard → Apps → Create App.** Add both API products: **Accounts and Trading Production** and **Market Data Production**.
3. Set the **Callback URL** to exactly:
   ```
   https://127.0.0.1:3000/api/auth/schwab/callback
   ```
   If you'll also host it on Vercel, add that callback too (see section 4). Separate several URLs with commas.
4. Submit. Approval usually takes a few days, and the app shows **Ready For Use** when it's done.

### b. Add the keys and connect

1. Copy the app's **App Key** and **Secret** into `.env.local`:
   ```
   SCHWAB_APP_KEY=...
   SCHWAB_APP_SECRET=...
   ```
2. Restart `npm run dev`.
3. In the dashboard, go to **Settings → Connect Schwab** and sign in on Schwab's own site. You'll come straight back to the dashboard with live data.

**Schwab makes you sign in again every 7 days.** That's Schwab's rule, not the app's. The top bar warns you two days ahead, and reconnecting takes one click.

The app only **reads** your accounts. It has no code that places orders or moves money.

---

## 3. Add earnings, news and sectors (optional, free)

Get a free API key at [finnhub.io](https://finnhub.io/register) and add it to `.env.local`:

```
FINNHUB_API_KEY=...
```

This adds earnings dates, analyst ratings, company news, insider buying and stock sectors. Without it, everything else still works.

---

## 4. Host it on Vercel (optional)

1. Push your copy of the repo to a **private** GitHub repo (the license doesn't allow republishing it), then **Import** it at [vercel.com/new](https://vercel.com/new).
2. **Add a database:** Project → **Storage → Create → Turso** (free), connected to the **Production** environment. The app finds Turso's variables automatically and creates its tables on first use. Without a database it falls back to a temporary one that resets often, which means reconnecting Schwab often.
3. **Add environment variables** (Project → Settings → Environment Variables, with **Production** ticked):

   | Variable | Value |
   |---|---|
   | `AUTH_EMAIL` | Copy from your `.env.local` |
   | `AUTH_PASSWORD_HASH` | Copy from your `.env.local` (a hash, never your actual password) |
   | `AUTH_SECRET` | Copy from your `.env.local` |
   | `SCHWAB_APP_KEY` | Your Schwab App Key |
   | `SCHWAB_APP_SECRET` | Your Schwab Secret |
   | `FINNHUB_API_KEY` | Optional |

4. **Redeploy.** Vercel only applies environment variable changes to new deployments.
5. In your Schwab app, add the hosted callback: `https://<your-domain>/api/auth/schwab/callback`.
6. Open the site, sign in, then **Settings → Connect Schwab**.

**Settings → Server configuration** shows a check or a cross for each variable, so you can see right away if something's missing.

### Custom domain

Vercel → Project → **Settings → Domains → Add**, then create the DNS record it shows you at your domain registrar. Add the new domain's callback URL to your Schwab app as well.

---

## Environment variables

| Variable | Needed for | Notes |
|---|---|---|
| `AUTH_EMAIL`, `AUTH_PASSWORD_HASH`, `AUTH_SECRET` | Signing in | Written by `npm run set-password`. Only a salted scrypt hash of the password is stored. |
| `SCHWAB_APP_KEY`, `SCHWAB_APP_SECRET` | Live data | From developer.schwab.com |
| `FINNHUB_API_KEY` | Earnings, news, ratings, insider trades, sectors | Optional |
| `DATA_MODE` | | `auto` (default): live when connected, otherwise sample data. `mock` always uses sample data. You can also switch in Settings. |
| `SCHWAB_CALLBACK_URL` | | Optional. Defaults to `https://127.0.0.1:3000/...` locally and your production domain on Vercel. |
| `TOKEN_ENCRYPTION_KEY` | | Optional. Encrypts stored Schwab tokens; derived from `AUTH_SECRET` if not set. |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | | Optional. Locally a SQLite file is created at `data/dashboard.db`. On Vercel, Turso's variables are found automatically. |

---

## Using it

| Page | What it answers |
|---|---|
| **Overview** | How am I doing? Growth over the past week, month and year; net worth vs the S&P 500; a scorecard (you vs the S&P, today's winners vs losers, distance from your high, lead over the same deposits in the S&P); top holdings; watchlist movers; signals; accounts; a heatmap of today or this week. |
| **Holdings** | What do I own? Every position combined across accounts, sector / asset type / account breakdowns, and concentration. |
| **Watchlist** | What am I watching? Tiles or a table, with sparklines, 52-week range, earnings dates and target prices. |
| **Trades** | Am I making good decisions? Each trade graded A–F, with "if you'd held / if you'd sold" and room for notes. |
| **Performance** | Am I beating the market? Time- and money-weighted returns, the "same deposits in the S&P" comparison, risk, dividends, taxes. |
| **Insights** | What needs attention? Every signal with the numbers behind it. Snooze or mute any of them. |
| **Settings** | Connection, data source (Live / Sample), account names, signal thresholds. |

The account switcher in the top bar (or **⌘K**) narrows every page to one account. Click any ticker to open its detail page.

Signals are mechanical rules with thresholds you can change in Settings. They're not investment advice.

### How fresh is the data?

| Data | Refreshed |
|---|---|
| Balances, positions, quotes | Every minute |
| Intraday charts | Every 2 minutes |
| Daily price history | Once a day (stored in the database; today's price comes from the live quote) |
| Transactions | Last 90 days on every load; 3 years back once a day, in the background |
| Earnings / ratings / news / insider trades / company profiles | 6 hours / 1 day / 1 hour / 1 day / 7 days |

Schwab's API only keeps about a year of transactions and has no balance history, so the app stores every transaction it sees and records each day's balances. Your history gets more accurate the longer you use it.

---

## Privacy and security

- **The whole site is behind your login.** A server-side check turns away anyone without a valid session before any page, API route or action runs. Sessions end after 12 hours idle or 7 days. Five wrong passwords lock sign-in for 15 minutes. Search engines are told not to index it.
- **Your keys never go in git.** `.env.local` and the database are gitignored, and a pre-commit hook blocks any commit containing `.env` files, certificates, the database, or any value from `.env.local`. Run it on demand with `npm run check:secrets`.
- **Schwab tokens are encrypted** (AES-256-GCM) in your database.
- **Sample data is invented.** The accounts in `lib/data/mock/` don't belong to anyone.
- Change your login any time with `npm run set-password`, then update `AUTH_PASSWORD_HASH` on Vercel and redeploy.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Browser says the connection isn't private (local) | Expected for the local self-signed certificate. Choose *Advanced → Proceed*. |
| "Login isn't set up" | Run `npm run set-password`. On Vercel, add the three `AUTH_*` variables to **Production** and redeploy. |
| Settings shows a variable as "not found" on Vercel | Check that the variable has **Production** ticked, then redeploy. |
| Schwab says the callback URL is invalid | The URL in your Schwab app must match the one shown in Settings exactly, including `https` and the port. |
| You keep having to reconnect Schwab on Vercel | Settings → Server configuration → Database should say "Turso (hosted)". If it says "temporary", add Turso (section 4). |
| "Live data failed, so sample data is showing" | The error is shown in Settings. Usually it's an expired login: click **Reconnect**. |

---

## Development

```bash
npm run dev          # HTTPS dev server on https://127.0.0.1:3000
npm test             # analytics and scenario tests (Vitest)
npm run typecheck
npm run lint
npm run build
```

```
app/                   pages (App Router), server actions, Schwab OAuth routes
lib/data/schwab/*      Schwab API client, OAuth, zod schemas, normalizers
lib/data/finnhub/*     Finnhub client and normalizers
lib/data/mock/*        the sample world, returned in Schwab's own response format
lib/data/load.ts       loads everything into one PortfolioData object (live or sample)
lib/analytics/*        indicators, trend score, signals, returns, risk, trade grading
lib/model.ts           data + account scope + settings → what the pages render
lib/db/*               SQLite locally / Turso on Vercel, via Drizzle
components/charts/*    custom SVG charts
```

Sample data goes through the same normalizers as live data, so the sample and live versions of every page are built by the same code.

Ideas and parked features live in [ROADMAP.md](ROADMAP.md).

---

## License

[PolyForm Strict 1.0.0](LICENSE.md). You're welcome to download it and run it for yourself, for personal, non-commercial use. You may not change it, build on it, redistribute it, or use it commercially. All rights not granted are reserved by the author. For anything else, ask first.
