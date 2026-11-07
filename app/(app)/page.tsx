import Link from "next/link";
import { Suspense } from "react";
import { AllocationBar } from "@/components/charts/AllocationBar";
import { BreadthRing } from "@/components/charts/BreadthRing";
import { Sparkline } from "@/components/charts/Sparkline";
import { Treemap } from "@/components/charts/Treemap";
import { SignalIcon } from "@/components/insights/SignalIcon";
import { NetWorthCard } from "@/components/overview/NetWorthCard";
import { Card, CardHeader, Chip, Delta, SEVERITY_TONE, Skeleton, Stat, toneClass } from "@/components/ui/primitives";
import { getPageContext } from "@/lib/context";
import { monthLabel } from "@/lib/dates";
import { money, pct, pts, price, toneOf } from "@/lib/format";
import { netWorthSeries, upcomingEvents } from "@/lib/model";

export default function OverviewPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview />
    </Suspense>
  );
}

const TAX_LABEL = { taxable: "Taxable", "tax-deferred": "Tax-deferred", "tax-free": "Tax-free" } as const;

async function Overview() {
  const { model, data, watchlists, watchSymbols } = await getPageContext();
  const series = netWorthSeries(model);
  const events = upcomingEvents(model, watchSymbols);
  const h = model.holdings;
  const breadth = h.map((x) => ({ symbol: x.symbol, pct: x.dayPct }));
  const upCount = h.filter((x) => x.dayPct > 0).length;
  const movers = [...h].sort((a, b) => Math.abs(b.dayPL) - Math.abs(a.dayPL)).slice(0, 5);
  const insights = model.groups.slice(0, 5);
  const realizedWin = model.scorecard.winRate;
  const held = new Set(h.map((x) => x.symbol));
  const watchMovers = [...new Set(watchlists.flatMap((w) => w.items.map((i) => i.symbol)))]
    .filter((s) => !held.has(s) && data.quotes[s])
    .map((s) => ({ symbol: s, q: data.quotes[s], target: watchlists.flatMap((w) => w.items).find((i) => i.symbol === s)?.targetPrice ?? null, spark: (data.daily[s] ?? []).slice(-30).map((b) => b.close) }))
    .sort((a, b) => Math.abs(b.q.changePct) - Math.abs(a.q.changePct))
    .slice(0, 6);
  const cashPct = model.total > 0 ? model.cash / model.total : 0;
  const yieldPct = model.total > 0 ? model.fwdDividends / model.invested : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Day P&L" value={money(model.dayPL, { sign: true })} sub={pct(model.dayPct)} tone={toneOf(model.dayPL)} />
        <Stat label="Unrealized" value={money(model.unrealized, { sign: true })} sub={`${pct(model.costBasis ? model.unrealized / model.costBasis : 0, { digits: 1 })} on cost`} tone={toneOf(model.unrealized)} />
        <Stat label="YTD return" value={pct(model.ytd.twr, { digits: 1 })} sub={`S&P ${pct(model.ytd.bench, { digits: 1 })} · ${pts(model.ytd.twr - model.ytd.bench)}`} tone={toneOf(model.ytd.twr)} />
        <Stat label="Realized YTD" value={money(model.realized.all, { sign: true })} sub={`Win rate ${Math.round(realizedWin * 100)}%`} />
        <Stat label="Cash" value={money(model.cash)} sub={`${pct(cashPct, { digits: 1, sign: false })} of portfolio`} />
        <Stat label="Fwd dividends" value={money(model.fwdDividends)} sub={`${pct(yieldPct, { digits: 1, sign: false })} yield · ${money(model.dividendsYtd)} YTD`} />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3 2xl:grid-cols-4">
        <Card className="lg:col-span-2 2xl:col-span-2">
          <NetWorthCard series={series} total={model.total} label={model.scopeLabel} />
        </Card>
        <Card className="flex flex-col">
          <CardHeader title="Today" right={`${h.length} holdings`} />
          <div className="flex justify-center py-1">
            <BreadthRing items={breadth} />
          </div>
          <div className="mb-1 mt-1 flex items-center justify-between text-[0.6875rem] text-fg-3">
            <span>Biggest movers by $</span>
            <span>
              <span className="text-up">{upCount} up</span> · <span className="text-down">{h.length - upCount} down</span>
            </span>
          </div>
          <div className="flex flex-col">
            {movers.map((m) => (
              <Link key={m.symbol} href={`/symbol/${m.symbol}`} className="flex items-center border-t border-line py-[0.3125rem] text-[0.75rem] hover:bg-white/[0.02]">
                <span className="w-14 font-medium">{m.symbol}</span>
                <Delta value={m.dayPct} digits={1} />
                <span className={`ml-auto ${toneClass(m.dayPL)}`}>{money(m.dayPL, { sign: true })}</span>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="hidden 2xl:block">
          <CardHeader title="Watchlist movers" right={<Link href="/watchlist">View all</Link>} />
          {watchMovers.map((w) => (
            <Link key={w.symbol} href={`/symbol/${w.symbol}`} className="flex items-center gap-2 border-t border-line py-2 text-[0.75rem] first:border-0 hover:bg-white/[0.02]">
              <div className="w-14">
                <div className="font-medium">{w.symbol}</div>
                <div className="text-[0.6562rem] text-fg-3">{price(w.q.last)}</div>
              </div>
              <Sparkline values={w.spark} width={80} height={25} />
              <div className="ml-auto text-right">
                <Delta value={w.q.changePct} digits={1} />
                {w.target != null && <div className="text-[0.6562rem] text-fg-3">{pct(w.q.last / w.target - 1, { digits: 1 })} to target</div>}
              </div>
            </Link>
          ))}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <Card>
          <CardHeader title="Insights" right={<Link href="/insights" className="hover:text-fg-2">{model.groups.length} active</Link>} />
          {insights.map(({ key, primary: s, related }) => (
            <Link key={key} href={s.symbol ? `/symbol/${s.symbol}` : "/insights"} className="flex items-center gap-2.5 border-t border-line py-[0.4375rem] hover:bg-white/[0.02]">
              <SignalIcon signal={s} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.75rem]">{s.title}</div>
                <div className="truncate text-[0.6562rem] text-fg-3">
                  {s.detail}
                  {related.length > 0 && <span className="text-fg-3"> · also {related.map((r) => r.tag.toLowerCase()).join(", ")}</span>}
                </div>
              </div>
              <Chip tone={SEVERITY_TONE[s.severity]}>{s.tag}</Chip>
            </Link>
          ))}
        </Card>
        <Card>
          <CardHeader title="Accounts" right={`${model.accountSummaries.length} linked`} />
          <AllocationBar
            legend={false}
            height={8}
            segments={model.accountSummaries.map((a) => ({ label: a.account.name, value: a.value, color: a.account.color }))}
          />
          <div className="mt-1.5">
            {model.accountSummaries.map((a) => (
              <div key={a.account.id} className="flex items-center gap-2.5 border-t border-line py-[0.4375rem]">
                <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: a.account.color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.75rem]">{a.account.name}</div>
                  <div className="text-[0.6562rem] text-fg-3">
                    {TAX_LABEL[a.account.taxTreatment]} · {a.account.mask} · {a.positions} positions
                  </div>
                </div>
                <Sparkline values={a.spark} width={80} height={25} />
                <div className="min-w-[4.875rem] text-right">
                  <div className="text-[0.75rem]">{money(a.value)}</div>
                  <div className={`text-[0.6562rem] ${toneClass(a.dayChange)}`}>
                    {money(a.dayChange, { sign: true })} · {pct(a.dayPct, { digits: 1 })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Heatmap" right="Size = value · color = today" />
          <Treemap items={h.map((x) => ({ symbol: x.symbol, value: x.marketValue, changePct: x.dayPct }))} height={210} aspect={3.4} />
        </Card>
        <Card>
          <CardHeader title="Coming up" right="Next 14 days" />
          {events.length === 0 && <p className="py-6 text-center text-[0.75rem] text-fg-3">Nothing scheduled</p>}
          {events.slice(0, 6).map((e) => {
            const { month, day } = monthLabel(e.date);
            return (
              <Link key={`${e.kind}${e.symbol}`} href={`/symbol/${e.symbol}`} className="flex items-center gap-2.5 border-t border-line py-[0.375rem] first:border-0 hover:bg-white/[0.02]">
                <div className={`w-[2.125rem] rounded-md py-0.5 text-center leading-tight ${e.attention ? "bg-warn/14" : "bg-white/5"}`}>
                  <div className="text-[0.5938rem] text-fg-3">{month}</div>
                  <div className={`text-[0.7812rem] font-medium ${e.attention ? "text-warn" : ""}`}>{day}</div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[0.75rem]">{e.title}</div>
                  <div className="truncate text-[0.6562rem] text-fg-3">{e.detail}</div>
                </div>
              </Link>
            );
          })}
        </Card>
      </div>

      <Card className="pb-1">
        <CardHeader title="Top holdings" right={<Link href="/holdings" className="hover:text-fg-2">All {h.length} holdings</Link>} />
        <div className="-mx-3 overflow-x-auto px-3">
          <table className="w-full min-w-[40rem] table-fixed text-[0.75rem]">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[12%]" />
              <col className="w-[11%]" />
              <col className="w-[9%]" />
              <col className="w-[12%]" />
              <col className="w-[13%]" />
              <col className="w-[10%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead>
              <tr className="text-[0.6562rem] text-fg-3">
                <th className="py-1 text-left font-normal">Symbol</th>
                <th className="text-center font-normal">30 days</th>
                <th className="text-right font-normal">Price</th>
                <th className="text-right font-normal">Day</th>
                <th className="text-right font-normal">Value</th>
                <th className="text-right font-normal">Weight</th>
                <th className="text-right font-normal">Gain</th>
                <th className="pr-1 text-right font-normal">Signal</th>
              </tr>
            </thead>
            <tbody>
              {h.slice(0, 8).map((x) => (
                <tr key={x.symbol} className="border-t border-line">
                  <td className="py-1.5">
                    <Link href={`/symbol/${x.symbol}`} className="hover:underline">
                      <div className="font-medium">{x.symbol}</div>
                      <div className="truncate text-[0.6562rem] text-fg-3">{x.name}</div>
                    </Link>
                  </td>
                  <td>
                    <div className="flex justify-center">
                      <Sparkline values={x.spark} />
                    </div>
                  </td>
                  <td className="text-right">{price(x.price)}</td>
                  <td className="text-right">
                    <Delta value={x.dayPct} digits={1} />
                  </td>
                  <td className="text-right">{money(x.marketValue)}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <span>{pct(x.weight, { digits: 1, sign: false })}</span>
                      <span className="h-1 w-7 overflow-hidden rounded-full bg-white/7">
                        <span className="block h-full bg-accent" style={{ width: `${Math.min(100, x.weight * 400)}%` }} />
                      </span>
                    </div>
                  </td>
                  <td className="text-right">
                    <Delta value={x.gainPct} digits={0} />
                  </td>
                  <td className="pr-1 text-right">
                    {x.tags[0] ? <Chip tone={SEVERITY_TONE[x.tags[0].severity]}>{x.tags[0].tag}</Chip> : <Chip>{x.trendLabel}</Chip>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[3.875rem]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Skeleton className="h-[19.375rem] lg:col-span-2" />
        <Skeleton className="h-[19.375rem]" />
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <Skeleton className="h-[13.75rem]" />
        <Skeleton className="h-[13.75rem]" />
      </div>
    </div>
  );
}
