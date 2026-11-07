import Link from "next/link";
import { Suspense } from "react";
import { AllocationBar } from "@/components/charts/AllocationBar";
import { Sparkline } from "@/components/charts/Sparkline";
import { SignalIcon } from "@/components/insights/SignalIcon";
import { HeatmapCard } from "@/components/overview/HeatmapCard";
import { ScorecardCard, type ScorecardData } from "@/components/overview/ScorecardCard";
import { NetWorthCard } from "@/components/overview/NetWorthCard";
import { Card, CardHeader, Chip, Delta, SEVERITY_TONE, Skeleton, Stat, toneClass } from "@/components/ui/primitives";
import { getPageContext } from "@/lib/context";
import { dayName, fmtDate, monthLabel } from "@/lib/dates";
import { money, pct, pts, price, toneOf } from "@/lib/format";
import type { PortfolioModel, RangeKey, RangeSeries } from "@/lib/model";
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
  const scorecard = buildScorecard(model, series);
  const insights = model.groups.slice(0, 5);
  const accounts = [...model.accountSummaries].sort((a, b) => b.value - a.value);
  const range = (k: RangeKey) => series.find((x) => x.key === k);
  const held = new Set(h.map((x) => x.symbol));
  const watchMovers = [...new Set(watchlists.flatMap((w) => w.items.map((i) => i.symbol)))]
    .filter((s) => !held.has(s) && data.quotes[s])
    .map((s) => ({ symbol: s, q: data.quotes[s], target: watchlists.flatMap((w) => w.items).find((i) => i.symbol === s)?.targetPrice ?? null, spark: (data.daily[s] ?? []).slice(-30).map((b) => b.close) }))
    .sort((a, b) => Math.abs(b.q.changePct) - Math.abs(a.q.changePct))
    .slice(0, 6);
  const cashPct = model.total > 0 ? model.cash / model.total : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <GrowthStat label="Past week" s={range("1W")} />
        <GrowthStat label="Past month" s={range("1M")} />
        <GrowthStat label="Past year" s={range("1Y")} />
        <Stat label="Unrealized gain" value={money(model.unrealized, { sign: true })} sub={`${pct(model.costBasis ? model.unrealized / model.costBasis : 0, { digits: 1 })} on cost`} tone={toneOf(model.unrealized)} />
        <Stat label="Cash" value={money(model.cash)} sub={`${pct(cashPct, { digits: 1, sign: false })} of portfolio`} />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <NetWorthCard series={series} total={model.total} label={model.scopeLabel} />
        </Card>
        <Card>
          <ScorecardCard data={scorecard} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Card className="pb-1 lg:col-span-2">
          <CardHeader title="Top holdings" right={<Link href="/holdings" className="hover:text-fg-2">All {h.length} holdings</Link>} />
          <div className="-mx-3 overflow-x-auto px-3">
            <table className="w-full min-w-[36rem] table-fixed text-[0.75rem]">
              <colgroup>
                <col className="w-[19%]" />
                <col className="w-[12%]" />
                <col className="w-[11%]" />
                <col className="w-[9%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[9%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr className="text-[0.6562rem] text-fg-3">
                  <th className="py-1 text-left font-normal">Symbol</th>
                  <th className="text-center font-normal">30 days</th>
                  <th className="text-right font-normal">Day $</th>
                  <th className="text-right font-normal">Day %</th>
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
                    <td className={`text-right ${toneClass(x.dayPL)}`}>{money(x.dayPL, { sign: true })}</td>
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
        <Card>
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
            segments={accounts.map((a) => ({ label: a.account.name, value: a.value, color: a.account.color }))}
          />
          <div className="mt-1.5">
            {accounts.map((a) => (
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
          <HeatmapCard holdings={h.map((x) => ({ symbol: x.symbol, value: x.marketValue, dayPct: x.dayPct, dayPL: x.dayPL, weekPct: x.w1 }))} />
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

    </div>
  );
}

function buildScorecard(model: PortfolioModel, series: RangeSeries[]): ScorecardData {
  const periods = (["1D", "1W", "1M", "YTD"] as const)
    .map((k) => series.find((x) => x.key === k))
    .filter((x): x is RangeSeries => !!x)
    .map((x) => ({ key: x.key, you: x.gainPct, spy: x.benchPct }));

  const byPL = [...model.holdings].sort((a, b) => b.dayPL - a.dayPL);
  const movers = {
    winners: byPL.filter((x) => x.dayPL > 0).slice(0, 2).map((x) => ({ symbol: x.symbol, pl: x.dayPL })),
    losers: byPL.filter((x) => x.dayPL < 0).reverse().slice(0, 2).map((x) => ({ symbol: x.symbol, pl: x.dayPL })),
    gained: byPL.filter((x) => x.dayPL > 0).reduce((s, x) => s + x.dayPL, 0),
    lost: byPL.filter((x) => x.dayPL < 0).reduce((s, x) => s + x.dayPL, 0),
    up: byPL.filter((x) => x.dayPL > 0).length,
    down: byPL.filter((x) => x.dayPL < 0).length,
  };

  // Drawdown on the time-weighted index, so deposits and withdrawals don't count as gains or losses.
  const { twr, history } = model;
  let peak = 0;
  for (let i = 1; i < twr.length; i++) if (twr[i] >= twr[peak]) peak = i;
  const lastI = twr.length - 1;
  const recent = twr.slice(-253);
  const underwater = recent.map((v, i) => v / Math.max(...recent.slice(0, i + 1)) - 1);
  const high = {
    drawdown: twr.length ? twr[lastI] / twr[peak] - 1 : 0,
    peakDate: history[peak]?.date ?? model.data.asOf,
    sessionsSince: Math.max(0, lastI - peak),
    underwater,
  };

  const all = series.find((x) => x.key === "ALL");
  const diffs = (all?.points ?? []).filter((p) => Number.isFinite(p.b)).map((p) => p.v - p.b);
  const shadow =
    all && diffs.length > 1
      ? { ahead: model.total - (all.points.at(-1)?.b ?? model.total), since: history[0]?.date ?? model.data.asOf, diff: diffs }
      : null;

  const session = `${dayName(model.data.asOf)} ${fmtDate(model.data.asOf, "short")}`;
  return { periods, session, movers, high, shadow };
}

/** Dollar growth over a range (excluding deposits), with % and the S&P comparison. */
function GrowthStat({ label, s }: { label: string; s: RangeSeries | undefined }) {
  if (!s) return <Stat label={label} value="—" sub="Not enough history yet" />;
  return (
    <Stat
      label={label}
      value={money(s.gain, { sign: true })}
      tone={toneOf(s.gain)}
      sub={
        <>
          {pct(s.gainPct, { digits: 1 })} · vs S&amp;P <span className={toneClass(s.gainPct - s.benchPct)}>{pts(s.gainPct - s.benchPct)}</span>
        </>
      }
    />
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
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
