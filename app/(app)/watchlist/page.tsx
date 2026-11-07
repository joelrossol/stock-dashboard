import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui/primitives";
import { WatchlistView, type WatchListData, type WatchTile } from "@/components/watchlist/WatchlistView";
import { getPageContext } from "@/lib/context";
import { diffDays } from "@/lib/dates";

export const metadata: Metadata = { title: "Watchlist" };

export default function WatchlistPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[31.25rem]" />}>
      <Watchlist />
    </Suspense>
  );
}

async function Watchlist() {
  const { data, model, watchlists } = await getPageContext();
  const held = new Set(data.positions.map((p) => p.symbol));
  const nextEarnings = (s: string) => {
    const e = data.earnings.filter((x) => x.symbol === s && x.date >= data.asOf).sort((a, b) => a.date.localeCompare(b.date))[0];
    return e ? diffDays(data.asOf, e.date) : null;
  };

  const lists: WatchListData[] = watchlists.map((w) => ({
    id: w.id,
    name: w.name,
    tiles: w.items
      .filter((i) => data.quotes[i.symbol])
      .map((i): WatchTile => {
        const q = data.quotes[i.symbol];
        const m = model.metrics[i.symbol];
        const daily = data.daily[i.symbol] ?? [];
        const intra = (data.intraday[i.symbol] ?? []).filter((b) => b.date === data.asOf).map((b) => b.close);
        return {
          symbol: i.symbol,
          name: data.instruments[i.symbol]?.name ?? q.name,
          last: q.last,
          changePct: q.changePct,
          spark: { "1D": [q.prevClose, ...intra], "1M": daily.slice(-22).map((b) => b.close), "3M": daily.slice(-64).map((b) => b.close) },
          ret: { "1D": q.changePct, "1M": m?.ret1m ?? null, "3M": m?.ret3m ?? null },
          trendLabel: m?.trendLabel ?? "Neutral",
          trendScore: m?.trendScore ?? 0,
          rsi: m?.rsi14 ?? null,
          high52: q.week52High,
          low52: q.week52Low,
          earningsIn: nextEarnings(i.symbol),
          target: i.targetPrice,
          note: i.note,
          held: held.has(i.symbol),
        };
      }),
  }));
  const universe = data.universe.map((s) => ({ symbol: s, name: data.instruments[s]?.name ?? s }));
  const total = lists.reduce((s, l) => s + l.tiles.length, 0);

  return (
    <div>
      <PageHeader title="Watchlist" sub={`${total} symbols across ${lists.length} lists · targets trigger an insight when hit`} />
      <WatchlistView lists={lists} universe={universe} />
    </div>
  );
}
