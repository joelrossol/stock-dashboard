# Product roadmap

Ideas that are parked, not scheduled. Move an item into a build when it earns its place.

## Overview

- **Forward dividends tile.** Removed from the KPI row (Nov 2026) because it wasn't pulling its weight there. Showed expected income over the next 12 months, the forward yield, and dividends received YTD. The calculation still exists (`model.fwdDividends`, `model.dividendsYtd`); the Performance page's dividend section is the likely home if it comes back.
- **Scorecard follow-ups.** Option B (a "today, explained" waterfall from yesterday's close to now) and option C (beat the S&P in X of the last 12 months) were pitched alongside the Scorecard and could become extra views.
- **Daily snapshot cron.** Record every account's balance after the close via Vercel Cron (`CRON_SECRET`), so history is exact even on days the app isn't opened.

## Holdings

- **Look-through sector exposure for funds.** Funds are now grouped by category (US large cap, bonds, international, and so on). The next step is splitting each fund into the sectors it holds (for example, VOO ≈ 30% technology), which needs fund holdings data that Finnhub's free tier doesn't include.

## Data

- **Schwab CSV import.** Month-end balances, older transactions, and realized gain/loss lots for exact long-range history and tax lots.
- **Streaming quotes** while the app is open locally.

## Notifications

- Email or push alerts for warning signals, and a daily digest.
