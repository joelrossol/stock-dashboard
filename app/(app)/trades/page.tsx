import type { Metadata } from "next";
import { Suspense } from "react";
import type { TradeMarker } from "@/components/charts/PriceChart";
import { TradesView, type TradeRow } from "@/components/trades/TradesView";
import { Card, CardHeader, GradeBadge, PageHeader, Skeleton, Stat, toneClass } from "@/components/ui/primitives";
import { getPageContext } from "@/lib/context";
import { fmtDate } from "@/lib/dates";
import { money, pct } from "@/lib/format";
import { getTradeNotes } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Trades" };

export default function TradesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[37.5rem]" />}>
      <Trades />
    </Suspense>
  );
}

async function Trades() {
  const [{ model, data }, notes] = await Promise.all([getPageContext(), getTradeNotes()]);
  const sc = model.scorecard;
  const acct = new Map(data.accounts.map((a) => [a.id, a]));

  const rows: TradeRow[] = model.reviews.map((r) => ({
    id: r.txn.id,
    side: r.side,
    symbol: r.symbol,
    name: data.instruments[r.symbol]?.name ?? r.symbol,
    date: r.date,
    accountId: r.accountId,
    accountName: acct.get(r.accountId)?.name ?? "",
    accountColor: acct.get(r.accountId)?.color ?? "#555",
    qty: r.qty,
    price: r.price,
    amount: r.amount,
    current: r.current,
    sinceTrade: r.sinceTrade,
    benchSince: r.benchSince,
    timingPct: r.timingPct,
    grade: r.grade,
    score: r.score,
    verdict: r.verdict,
    verdictTone: r.verdictTone,
    horizons: r.horizons.map((h) => ({ label: h.label, available: h.available, stockRet: h.stockRet, benchRet: h.benchRet, excess: h.excess, grade: h.grade })),
    proceeds: r.proceeds,
    valueIfHeld: r.valueIfHeld,
    missedDividends: r.missedDividends,
    heldDiff: r.heldDiff,
    maxAfter: r.maxAfter,
    realizedPnl: r.realizedPnl,
    realizedPct: r.realizedPct,
    holdingDays: r.holdingDays,
    alpha: r.alpha,
    mae: r.mae,
    stillHeld: r.stillHeld,
    lots: r.matches.map((m) => ({ qty: m.qty, buyDate: m.buyDate, buyPrice: m.buyPrice, pnl: m.pnl, term: m.term })),
    note: notes[r.txn.id] ?? "",
  }));

  const markersBySymbol: Record<string, TradeMarker[]> = {};
  for (const r of model.reviews) {
    (markersBySymbol[r.symbol] ??= []).push({ date: r.date, side: r.side, qty: r.qty, price: r.price, account: acct.get(r.accountId)?.name });
  }

  const sells = model.reviews.filter((r) => r.side === "SELL");
  const worstSell = [...sells].sort((a, b) => (b.heldDiff ?? 0) - (a.heldDiff ?? 0))[0];
  const bestSell = [...sells].sort((a, b) => (a.heldDiff ?? 0) - (b.heldDiff ?? 0))[0];
  const buys = model.reviews.filter((r) => r.side === "BUY");
  const bestBuy = [...buys].sort((a, b) => (b.alpha ?? 0) - (a.alpha ?? 0))[0];
  const gradeCounts = ["A", "B", "C", "D", "F"].map((g) => [g, model.reviews.filter((r) => r.grade === g).length] as const);
  const maxCount = Math.max(...gradeCounts.map(([, n]) => n), 1);

  const behaviors: { title: string; body: string; tone: "up" | "down" | "flat" }[] = [];
  if (sc.dispositionRatio > 1.15) {
    behaviors.push({
      title: `You hold losers ${sc.dispositionRatio.toFixed(1)}× longer than winners`,
      body: `Losing round trips lasted ${Math.round(sc.avgHoldLosers)} days on average vs ${Math.round(sc.avgHoldWinners)} for winners. This "disposition effect" is the most common way traders give back returns.`,
      tone: "down",
    });
  } else if (sc.roundTrips.length) {
    behaviors.push({ title: "You cut losers about as fast as winners", body: `Average hold: ${Math.round(sc.avgHoldLosers)} days for losers, ${Math.round(sc.avgHoldWinners)} for winners.`, tone: "up" });
  }
  if (sells.length) {
    behaviors.push({
      title: `${Math.round(sc.sellsBetterHeld * 100)}% of your sells would have been better held`,
      body: `Selling early left ${money(sc.leftOnTable)} on the table; selling saved you ${money(sc.savedBySelling)} on the others. Net: ${money(sc.savedBySelling - sc.leftOnTable, { sign: true })}.`,
      tone: sc.savedBySelling >= sc.leftOnTable ? "up" : "down",
    });
  }
  if (worstSell && (worstSell.heldDiff ?? 0) > 0) {
    behaviors.push({ title: `Costliest exit: ${worstSell.symbol} on ${fmtDate(worstSell.date, "short")}`, body: worstSell.verdict, tone: "down" });
  }
  if (bestSell && (bestSell.heldDiff ?? 0) < 0) {
    behaviors.push({ title: `Best exit: ${bestSell.symbol} on ${fmtDate(bestSell.date, "short")}`, body: bestSell.verdict, tone: "up" });
  }
  if (bestBuy) {
    behaviors.push({ title: `Best entry: ${bestBuy.symbol} on ${fmtDate(bestBuy.date, "short")}`, body: bestBuy.verdict, tone: "up" });
  }

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Trades"
        sub={
          data.mode === "mock"
            ? "Sample trade history. Live mode starts from what the Schwab API returns; CSV import will add older trades."
            : "History from the Schwab API, stored locally so it isn't lost when the API's window moves on."
        }
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Round trips" value={sc.roundTrips.length} sub={`${sc.wins} wins · ${sc.losses} losses`} />
        <Stat label="Win rate" value={pct(sc.winRate, { digits: 0, sign: false })} sub={`Avg win ${money(sc.avgWin)} · loss ${money(sc.avgLoss)}`} />
        <Stat label="Profit factor" value={Number.isFinite(sc.profitFactor) ? sc.profitFactor.toFixed(2) : "∞"} sub="Gross wins ÷ gross losses" />
        <Stat label="Realized P&L" value={money(sc.realizedTotal, { sign: true })} sub={`Expectancy ${money(sc.expectancy, { sign: true })}/trade`} tone={sc.realizedTotal >= 0 ? "up" : "down"} />
        <Stat label="Left on the table" value={money(sc.leftOnTable)} sub="By selling before further gains" tone="down" />
        <Stat label="Saved by selling" value={money(sc.savedBySelling)} sub="By selling before declines" tone="up" />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Patterns in your trading" right="From your full trade history" />
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {behaviors.map((b) => (
              <div key={b.title} className="border-t border-line py-2">
                <p className={`text-[0.7812rem] ${b.tone === "up" ? "text-up" : b.tone === "down" ? "text-down" : ""}`}>{b.title}</p>
                <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-fg-3">{b.body}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Decision grades" right={<span className="flex items-center gap-1.5">Average <GradeBadge grade={sc.avgGrade} /></span>} />
          <div className="flex flex-col gap-1.5">
            {gradeCounts.map(([g, n]) => (
              <div key={g} className="flex items-center gap-2 text-[0.75rem]">
                <GradeBadge grade={g} />
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div className={`h-full rounded-full ${g === "A" || g === "B" ? "bg-up/70" : g === "C" ? "bg-fg-3" : "bg-down/70"}`} style={{ width: `${(n / maxCount) * 100}%` }} />
                </div>
                <span className="w-6 text-right text-fg-2">{n}</span>
              </div>
            ))}
          </div>
          <p className={`mt-3 text-[0.6875rem] ${toneClass(sc.realizedTotal)}`}>
            {model.reviews.length} trades graded · {sells.length} sells, {buys.length} buys
          </p>
        </Card>
      </div>

      <TradesView rows={rows} markersBySymbol={markersBySymbol} />
    </div>
  );
}
