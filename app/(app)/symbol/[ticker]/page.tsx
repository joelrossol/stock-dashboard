import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PriceChart, type TradeMarker } from "@/components/charts/PriceChart";
import { SignalIcon } from "@/components/insights/SignalIcon";
import { Card, CardHeader, Chip, Delta, GradeBadge, Label, SEVERITY_TONE, Skeleton, toneClass } from "@/components/ui/primitives";
import { getPageContext } from "@/lib/context";
import { diffDays, fmtDate, fmtTimeET } from "@/lib/dates";
import { compactNumber, money, pct, price, shares } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/symbol/[ticker]">): Promise<Metadata> {
  const { ticker } = await params;
  return { title: ticker.toUpperCase() };
}

export default function SymbolPage({ params }: PageProps<"/symbol/[ticker]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem]" />}>
      <SymbolDetail params={params} />
    </Suspense>
  );
}

async function SymbolDetail({ params }: { params: PageProps<"/symbol/[ticker]">["params"] }) {
  const { ticker } = await params;
  const symbol = decodeURIComponent(ticker).toUpperCase();
  const { data, model, watchSymbols } = await getPageContext();
  const bars = data.daily[symbol];
  const q = data.quotes[symbol];
  if (!bars?.length || !q) notFound();

  const inst = data.instruments[symbol];
  const m = model.metrics[symbol];
  const holding = model.holdings.find((h) => h.symbol === symbol);
  const groups = model.groups.filter((g) => g.symbol === symbol);
  const signals = groups.flatMap((g) => [g.primary, ...g.related]);
  const reviews = model.reviews.filter((r) => r.symbol === symbol);
  const acct = new Map(data.accounts.map((a) => [a.id, a]));
  const markers: TradeMarker[] = reviews.map((r) => ({ date: r.date, side: r.side, qty: r.qty, price: r.price, account: acct.get(r.accountId)?.name }));
  const next = data.earnings.filter((e) => e.symbol === symbol && e.date >= data.asOf).sort((a, b) => a.date.localeCompare(b.date))[0];
  const recs = data.recommendations[symbol] ?? [];
  const rec = recs[0];
  const recTotal = rec ? rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell : 0;
  const news = data.news.filter((n) => n.symbol === symbol).slice(0, 4);
  const watched = watchSymbols.includes(symbol);
  const range = q.week52High > q.week52Low ? (q.last - q.week52Low) / (q.week52High - q.week52Low) : 0.5;
  const priceBars = bars.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[1.375rem] font-medium tracking-tight">{symbol}</h1>
            {holding && <Chip tone="accent">Held</Chip>}
            {watched && <Chip>Watchlist</Chip>}
            {m && <Chip tone={m.trendScore >= 20 ? "up" : m.trendScore <= -20 ? "down" : "neutral"}>{m.trendLabel}</Chip>}
          </div>
          <p className="text-[0.75rem] text-fg-3">
            {inst?.name ?? q.name} · {inst?.sector}
            {inst?.industry && inst.industry !== inst.sector && inst.industry !== "ETF" ? ` · ${inst.industry}` : ""}
          </p>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[1.625rem] font-medium tracking-tight">{price(q.last)}</span>
          <span className={toneClass(q.change)}>
            {q.change >= 0 ? "+" : "−"}
            {Math.abs(q.change).toFixed(2)} ({pct(q.changePct)})
          </span>
          <span className="text-[0.6875rem] text-fg-3">{data.mode === "mock" ? "sample" : "last"} · {fmtDate(data.asOf, "short")}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <PriceChart bars={priceBars} markers={markers} height={375} />
        </Card>
        <Card>
          <CardHeader title="Your position" right={holding ? `${pct(holding.weight, { digits: 1, sign: false })} of portfolio` : undefined} />
          {holding ? (
            <>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div>
                  <Label>Value</Label>
                  <p className="text-[0.9375rem] font-medium">{money(holding.marketValue)}</p>
                </div>
                <div>
                  <Label>Total gain</Label>
                  <p className={`text-[0.9375rem] font-medium ${toneClass(holding.gain)}`}>{money(holding.gain, { sign: true })}</p>
                  <p className="text-[0.6562rem]">
                    <Delta value={holding.gainPct} digits={1} />
                  </p>
                </div>
                <div>
                  <Label>Shares</Label>
                  <p className="text-[0.8125rem]">{shares(holding.quantity)}</p>
                </div>
                <div>
                  <Label>Average cost</Label>
                  <p className="text-[0.8125rem]">{price(holding.avgCost)}</p>
                </div>
                <div>
                  <Label>Today</Label>
                  <p className={`text-[0.8125rem] ${toneClass(holding.dayPL)}`}>{money(holding.dayPL, { sign: true })}</p>
                </div>
                <div>
                  <Label>Fwd dividends</Label>
                  <p className="text-[0.8125rem]">{money(holding.quantity * q.divAmount)}/yr</p>
                </div>
              </div>
              <div className="mt-2">
                {holding.accounts.map((a) => (
                  <div key={a.accountId} className="flex items-center gap-2 border-t border-line py-1.5 text-[0.75rem]">
                    <span className="h-2 w-2 rounded-[3px]" style={{ background: a.color }} />
                    <span className="min-w-0 flex-1 truncate text-fg-2">{a.name}</span>
                    <span className="text-fg-3">{shares(a.quantity)} sh</span>
                    <span className="w-20 text-right">{money(a.marketValue)}</span>
                    <Delta value={a.gainPct} digits={0} className="w-10 text-right" />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="py-4 text-[0.75rem] text-fg-3">You don&apos;t hold {symbol} in this view.</p>
          )}
          {reviews.length > 0 && (
            <>
              <p className="mb-0.5 mt-3 text-[0.6875rem] text-fg-3">Your trades</p>
              {reviews.slice(0, 6).map((r) => (
                <Link key={r.txn.id} href="/trades" className="flex items-center gap-2 border-t border-line py-1.5 text-[0.75rem] hover:bg-white/[0.02]">
                  <Chip tone={r.side === "BUY" ? "up" : "down"}>{r.side === "BUY" ? "Buy" : "Sell"}</Chip>
                  <span className="text-fg-2">{fmtDate(r.date, "short")}</span>
                  <span className="text-fg-3">
                    {shares(r.qty)} @ {price(r.price)}
                  </span>
                  <span className="ml-auto">
                    <GradeBadge grade={r.grade} />
                  </span>
                </Link>
              ))}
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader title="Key stats" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[0.75rem]">
            <Stat2 label="P/E" value={q.pe ? q.pe.toFixed(1) : "—"} />
            <Stat2 label="EPS" value={q.eps ? price(q.eps) : "—"} />
            <Stat2 label="Dividend yield" value={q.divYield ? pct(q.divYield, { sign: false }) : "—"} />
            <Stat2 label="Next ex-date" value={q.nextExDate ? fmtDate(q.nextExDate, "short") : "—"} />
            <Stat2 label="Avg volume (10d)" value={compactNumber(q.avgVolume10d)} />
            <Stat2 label="Market cap" value={inst?.marketCap ? `$${compactNumber(inst.marketCap)}` : "—"} />
          </div>
          <div className="mt-3">
            <Label>52-week range</Label>
            <div className="mt-1 flex items-center gap-2 text-[0.6562rem] text-fg-3">
              <span>{price(q.week52Low)}</span>
              <div className="relative h-1 flex-1 rounded-full bg-gradient-to-r from-down/50 via-white/15 to-up/50">
                <span className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg" style={{ left: `${range * 100}%` }} />
              </div>
              <span>{price(q.week52High)}</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Trend math" right={m ? `Score ${m.trendScore}` : undefined} />
          {m && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[0.75rem]">
              <Stat2 label="RSI (14)" value={m.rsi14?.toFixed(0) ?? "—"} />
              <Stat2 label="60-day trend" value={m.trend60 ? `${pct(m.trend60.annualized, { digits: 0 })}/yr` : "—"} />
              <Stat2 label="Consistency (R²)" value={m.trend60?.r2.toFixed(2) ?? "—"} />
              <Stat2 label="vs S&P (3M)" value={m.rs3m != null ? pct(m.rs3m, { digits: 1 }) : "—"} />
              <Stat2 label="vs 50-day" value={m.sma50 ? pct(m.last / m.sma50 - 1, { digits: 1 }) : "—"} />
              <Stat2 label="vs 200-day" value={m.sma200 ? pct(m.last / m.sma200 - 1, { digits: 1 }) : "—"} />
              <Stat2 label="Beta (1Y)" value={m.beta1y.toFixed(2)} />
              <Stat2 label="Volatility (1Y)" value={pct(m.vol1y, { digits: 0, sign: false })} />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Earnings and analysts" />
          {next ? (
            <div className="mb-3 flex items-center gap-2.5">
              <div className={`w-[2.375rem] rounded-md py-0.5 text-center leading-tight ${diffDays(data.asOf, next.date) <= 7 ? "bg-warn/14" : "bg-white/5"}`}>
                <div className="text-[0.5938rem] text-fg-3">{fmtDate(next.date, "short").split(" ")[0]}</div>
                <div className="text-[0.8125rem] font-medium">{next.date.slice(8).replace(/^0/, "")}</div>
              </div>
              <div className="text-[0.75rem]">
                <div>Next earnings in {diffDays(data.asOf, next.date)} days</div>
                <div className="text-[0.6562rem] text-fg-3">
                  {next.hour === "amc" ? "After close" : next.hour === "bmo" ? "Before open" : "Time TBD"}
                  {next.epsEstimate != null && ` · EPS est. ${price(next.epsEstimate)}`}
                </div>
              </div>
            </div>
          ) : (
            <p className="mb-3 text-[0.75rem] text-fg-3">No earnings date in the next 90 days.</p>
          )}
          {rec && recTotal > 0 ? (
            <>
              <div className="flex h-2 overflow-hidden rounded-full">
                {[
                  [rec.strongBuy, "#5FA57D"],
                  [rec.buy, "#7DBF96"],
                  [rec.hold, "#5A5870"],
                  [rec.sell, "#B48BD0"],
                  [rec.strongSell, "#9468B3"],
                ].map(([n, c], i) => (
                  <div key={i} style={{ flex: n as number, background: c as string }} />
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[0.6562rem] text-fg-3">
                <span className="text-up">{rec.strongBuy + rec.buy} buy</span>
                <span>{rec.hold} hold</span>
                <span className="text-down">{rec.sell + rec.strongSell} sell</span>
              </div>
              {recs[1] && <p className="mt-1.5 text-[0.6562rem] text-fg-3">Last month: {recs[1].strongBuy + recs[1].buy} buy · {recs[1].hold} hold · {recs[1].sell + recs[1].strongSell} sell</p>}
            </>
          ) : (
            <p className="text-[0.75rem] text-fg-3">No analyst coverage for this fund.</p>
          )}
        </Card>

        <Card>
          <CardHeader title="Signals" right={signals.length ? `${signals.length} active` : undefined} />
          {signals.length === 0 && <p className="py-4 text-[0.75rem] text-fg-3">Nothing flagged right now.</p>}
          {signals.map((s) => (
            <div key={s.id} className="flex items-start gap-2 border-t border-line py-1.5 first:border-0">
              <SignalIcon signal={s} size={25} />
              <div className="min-w-0 flex-1">
                <div className="text-[0.75rem]">{s.title}</div>
                <div className="text-[0.6562rem] text-fg-3">{s.detail}</div>
              </div>
              <Chip tone={SEVERITY_TONE[s.severity]}>{s.tag}</Chip>
            </div>
          ))}
        </Card>
      </div>

      {news.length > 0 && (
        <Card>
          <CardHeader title="News" right={data.mode === "mock" ? "Sample headlines" : "Finnhub"} />
          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            {news.map((n) => (
              <div key={n.id} className="border-t border-line py-2">
                <p className="text-[0.7812rem]">{n.headline}</p>
                <p className="text-[0.6562rem] text-fg-3">
                  {n.source} · {fmtDate(new Date(n.datetime).toISOString().slice(0, 10), "short")} {fmtTimeET(n.datetime)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat2({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.6562rem] text-fg-3">{label}</p>
      <p>{value}</p>
    </div>
  );
}
