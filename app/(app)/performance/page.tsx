import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ColumnBars, CorrelationGrid, DivergingBars } from "@/components/charts/Bars";
import { ShadowChart } from "@/components/performance/ShadowChart";
import { Card, CardHeader, Chip, Delta, Label, PageHeader, Skeleton, Stat, toneClass } from "@/components/ui/primitives";
import { correlationMatrix, marketStress, portfolioBeta, riskStats } from "@/lib/analytics/risk";
import { contributions, twrBetween, xirrForRange } from "@/lib/analytics/returns";
import { getPageContext } from "@/lib/context";
import { addDays, fmtDate, yearStart } from "@/lib/dates";
import { money, pct, pts } from "@/lib/format";
import { netWorthSeries } from "@/lib/model";

export const metadata: Metadata = { title: "Performance" };

export default function PerformancePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[43.75rem]" />}>
      <Performance />
    </Suspense>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function Performance() {
  const { model, data } = await getPageContext();
  const { history, twr, close } = model;
  const last = history.length - 1;
  const series = netWorthSeries(model);
  const all = series.find((s) => s.key === "ALL")!;
  const shadowEnd = all.points.at(-1)?.b ?? 0;
  const ahead = model.total - shadowEnd;

  // Period table: you vs the S&P.
  const idxFor = (key: string) => {
    if (key === "YTD") return Math.max(0, history.findIndex((p) => p.date >= yearStart(data.asOf)) - 1);
    const n = { "1M": 21, "3M": 63, "6M": 126, "1Y": 252 }[key];
    return n ? Math.max(0, last - n) : 0;
  };
  const periods = ["1M", "3M", "6M", "YTD", "1Y", "ALL"].map((k) => {
    const from = idxFor(k);
    const you = twrBetween(twr, from, last);
    const spy = close("SPY", history[last].date) / close("SPY", history[from].date) - 1;
    return { k, you, spy, since: history[from].date };
  });
  const xirrAll = xirrForRange(history, 0, last);

  // Risk over the last year.
  const yrFrom = Math.max(0, last - 252);
  const idxYear = twr.slice(yrFrom);
  const spyYear = history.slice(yrFrom).map((p) => close("SPY", p.date));
  const risk = riskStats(idxYear, spyYear);
  const hb = model.holdings.map((h) => ({ value: h.marketValue, beta: model.metrics[h.symbol]?.beta1y ?? 1 }));
  const beta = portfolioBeta(hb, model.total);
  const stress = marketStress(hb, model.total);
  const shocks = model.holdings.slice(0, 5).map((h) => ({ symbol: h.symbol, loss: -0.2 * h.marketValue, pctOf: (-0.2 * h.marketValue) / model.total }));
  const top = model.holdings.filter((h) => h.assetType !== "ETF").slice(0, 8);
  const corr = correlationMatrix(top.map((h) => ({ symbol: h.symbol, closes: (data.daily[h.symbol] ?? []).map((b) => b.close) })));
  const top5 = top.slice(0, 5);
  const corr5 = correlationMatrix(top5.map((h) => ({ symbol: h.symbol, closes: (data.daily[h.symbol] ?? []).map((b) => b.close) })));

  // Contribution year to date.
  const ytdFrom = idxFor("YTD");
  const contrib = contributions(history, ytdFrom, last, model.txns, close).filter((c) => Math.abs(c.pnl) >= 1);
  const winners = contrib.filter((c) => c.pnl > 0).slice(0, 6);
  const losers = contrib.filter((c) => c.pnl < 0).slice(-4);
  const leader = winners[0];

  // Income.
  const payers = model.holdings.filter((h) => (data.quotes[h.symbol]?.divAmount ?? 0) > 0);
  const months = Array.from({ length: 12 }, (_, k) => {
    const d = addDays(`${data.asOf.slice(0, 8)}01`, 32 * k);
    return { key: d.slice(0, 7), label: MONTHS[Number(d.slice(5, 7)) - 1] };
  });
  const monthly = new Map(months.map((m) => [m.key, 0]));
  for (const h of payers) {
    const q = data.quotes[h.symbol];
    const ex = q.nextExDate ?? addDays(data.asOf, 30);
    for (let k = 0; k < 4; k++) {
      const pay = addDays(addDays(ex, 14), 91 * k).slice(0, 7);
      if (monthly.has(pay)) monthly.set(pay, (monthly.get(pay) ?? 0) + (h.quantity * q.divAmount) / 4);
    }
  }
  const yoc = model.costBasis > 0 ? model.fwdDividends / model.costBasis : 0;
  const exDates = payers
    .map((h) => ({ h, q: data.quotes[h.symbol] }))
    .filter((x) => x.q.nextExDate && x.q.nextExDate >= data.asOf)
    .sort((a, b) => a.q.nextExDate!.localeCompare(b.q.nextExDate!))
    .slice(0, 5);

  // Tax.
  const soon = model.taxLots.filter((l) => l.daysToLongTerm > 0 && l.daysToLongTerm <= 90).sort((a, b) => a.daysToLongTerm - b.daysToLongTerm);
  const harvest = [...model.taxLots.reduce((m, l) => (l.unrealized < 0 ? m.set(l.symbol, (m.get(l.symbol) ?? 0) + l.unrealized) : m), new Map<string, number>())]
    .filter(([, v]) => v <= -model.thresholds.harvestMin)
    .sort((a, b) => a[1] - b[1]);
  const unrealizedST = model.taxLots.filter((l) => l.daysToLongTerm > 0).reduce((s, l) => s + l.unrealized, 0);
  const unrealizedLT = model.taxLots.filter((l) => l.daysToLongTerm <= 0).reduce((s, l) => s + l.unrealized, 0);
  const hasTaxable = model.accounts.some((a) => a.taxTreatment === "taxable");

  return (
    <div className="flex flex-col gap-2">
      <PageHeader title="Performance" sub={`${model.scopeLabel} · since ${fmtDate(history[0].date)}`} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <Stat label="Time-weighted (all)" value={pct(all.gainPct, { digits: 1 })} sub={`S&P ${pct(periods.at(-1)!.spy, { digits: 1 })}`} tone={all.gainPct >= 0 ? "up" : "down"} />
        <Stat label="Money-weighted (XIRR)" value={xirrAll != null ? `${pct(xirrAll, { digits: 1 })}/yr` : "—"} sub="Includes deposit timing" />
        <Stat label="vs S&P shadow" value={money(ahead, { sign: true })} sub="Same deposits, all in S&P" tone={ahead >= 0 ? "up" : "down"} />
        <Stat label="Volatility (1Y)" value={pct(risk.volatility, { digits: 0, sign: false })} sub={`Best ${pct(risk.bestDay, { digits: 1 })} · worst ${pct(risk.worstDay, { digits: 1 })}`} />
        <Stat label="Beta" value={beta.toFixed(2)} sub={beta > 1.05 ? "Moves more than the market" : beta < 0.95 ? "Moves less than the market" : "Moves with the market"} />
        <Stat label="Max drawdown (1Y)" value={pct(risk.maxDrawdown, { digits: 1 })} sub={`Now ${pct(risk.currentDrawdown, { digits: 1 })} from peak`} tone="down" />
        <Stat label="Sharpe (1Y)" value={risk.sharpe.toFixed(2)} sub={`Sortino ${risk.sortino.toFixed(2)}`} />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="You vs the same money in the S&P 500"
            right={<span className={toneClass(ahead)}>{ahead >= 0 ? `Ahead by ${money(ahead)}` : `Behind by ${money(-ahead)}`}</span>}
          />
          <ShadowChart series={all} />
          <p className="mt-1.5 text-[0.6562rem] leading-relaxed text-fg-3">
            The dashed line invests every deposit you made into an S&amp;P 500 fund on the same day. It is the most honest benchmark for a hands-on portfolio.
            {data.mode === "mock" ? "" : " Older history fills in once you import your Schwab CSVs."}
          </p>
        </Card>
        <Card>
          <CardHeader title="Returns by period" right="Time-weighted" />
          <table className="w-full text-[0.75rem]">
            <thead>
              <tr className="text-[0.6562rem] text-fg-3">
                <th className="py-1 text-left font-normal">Period</th>
                <th className="text-right font-normal">You</th>
                <th className="text-right font-normal">S&amp;P</th>
                <th className="text-right font-normal">Edge</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.k} className="border-t border-line">
                  <td className="py-1.5 text-fg-2">{p.k}</td>
                  <td className="text-right">
                    <Delta value={p.you} digits={1} />
                  </td>
                  <td className="text-right">
                    <Delta value={p.spy} digits={1} />
                  </td>
                  <td className={`text-right ${toneClass(p.you - p.spy)}`}>{pts(p.you - p.spy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 border-t border-line pt-2">
            <Label>Market gain year to date</Label>
            <p className={`text-[0.9375rem] font-medium ${toneClass(model.ytd.gain)}`}>{money(model.ytd.gain, { sign: true })}</p>
            <p className="text-[0.6562rem] text-fg-3">Excludes {money(history.slice(ytdFrom + 1).reduce((s, p) => s + p.flow, 0))} of deposits</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Card>
          <CardHeader title="What drove returns" right="Year to date" />
          {leader && (
            <p className="mb-2 text-[0.75rem] text-fg-2">
              <span className="text-fg">{leader.symbol}</span> drove {pct(leader.share, { digits: 0, sign: false })} of your gains this year.
            </p>
          )}
          <DivergingBars rows={[...winners, ...losers].map((c) => ({ label: c.symbol, value: c.pnl, href: `/symbol/${c.symbol}` }))} />
        </Card>
        <Card>
          <CardHeader title="Hidden concentration" right="6-month daily returns" />
          <p className="mb-2 text-[0.75rem] text-fg-2">
            Your top {top5.length} stocks have an average correlation of <span className="text-fg">{corr5.avgPairwise.toFixed(2)}</span>
            {corr5.avgPairwise > 0.5 ? ". They tend to move together." : ", a reasonable amount of independence."}
          </p>
          <CorrelationGrid symbols={corr.symbols} matrix={corr.matrix} />
        </Card>
        <Card>
          <CardHeader title="Stress test" right={`Portfolio beta ${beta.toFixed(2)}`} />
          {stress.map((s) => (
            <div key={s.label} className="flex items-center justify-between border-t border-line py-1.5 text-[0.75rem] first:border-0">
              <span className="text-fg-2">{s.label}</span>
              <span className="text-down">
                {money(s.impact)} <span className="text-fg-3">({pct(s.impactPct, { digits: 1 })})</span>
              </span>
            </div>
          ))}
          <p className="mb-1 mt-3 text-[0.6875rem] text-fg-3">If one top holding dropped 20%</p>
          {shocks.map((s) => (
            <div key={s.symbol} className="flex items-center justify-between border-t border-line py-1.5 text-[0.75rem]">
              <Link href={`/symbol/${s.symbol}`} className="font-medium hover:underline">
                {s.symbol}
              </Link>
              <span className="text-down">
                {money(s.loss)} <span className="text-fg-3">({pct(s.pctOf, { digits: 1 })})</span>
              </span>
            </div>
          ))}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Dividend income" right={`${money(model.dividendsYtd)} received this year`} />
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div>
              <Label>Next 12 months</Label>
              <p className="text-[0.9375rem] font-medium">{money(model.fwdDividends)}</p>
            </div>
            <div>
              <Label>Yield on cost</Label>
              <p className="text-[0.9375rem] font-medium">{pct(yoc, { digits: 2, sign: false })}</p>
            </div>
            <div>
              <Label>Paying positions</Label>
              <p className="text-[0.9375rem] font-medium">{payers.length}</p>
            </div>
          </div>
          <ColumnBars rows={months.map((m, i) => ({ label: m.label, value: monthly.get(m.key) ?? 0, highlight: i === 0 }))} />
          {exDates.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {exDates.map(({ h, q }) => (
                <Chip key={h.symbol}>
                  {h.symbol} ex-div {fmtDate(q.nextExDate!, "short")} · {money((h.quantity * q.divAmount) / 4)}
                </Chip>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Tax view" right="Taxable accounts" />
          {!hasTaxable ? (
            <p className="py-6 text-center text-[0.75rem] text-fg-3">No taxable accounts in this view.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Realized short-term</Label>
                  <p className={`text-[0.875rem] font-medium ${toneClass(model.realized.taxableShort)}`}>{money(model.realized.taxableShort, { sign: true })}</p>
                </div>
                <div>
                  <Label>Realized long-term</Label>
                  <p className={`text-[0.875rem] font-medium ${toneClass(model.realized.taxableLong)}`}>{money(model.realized.taxableLong, { sign: true })}</p>
                </div>
                <div>
                  <Label>Unrealized short-term</Label>
                  <p className={`text-[0.8125rem] ${toneClass(unrealizedST)}`}>{money(unrealizedST, { sign: true })}</p>
                </div>
                <div>
                  <Label>Unrealized long-term</Label>
                  <p className={`text-[0.8125rem] ${toneClass(unrealizedLT)}`}>{money(unrealizedLT, { sign: true })}</p>
                </div>
              </div>
              {soon.length > 0 && (
                <>
                  <p className="mb-0.5 mt-3 text-[0.6875rem] text-fg-3">Turning long-term soon</p>
                  {soon.slice(0, 3).map((l) => (
                    <div key={l.txnId} className="flex items-center justify-between border-t border-line py-1.5 text-[0.75rem]">
                      <span>
                        <span className="font-medium">{l.symbol}</span> <span className="text-fg-3">{l.qty} sh</span>
                      </span>
                      <span>
                        <span className={toneClass(l.unrealized)}>{money(l.unrealized, { sign: true })}</span> <span className="text-fg-3">in {l.daysToLongTerm}d</span>
                      </span>
                    </div>
                  ))}
                </>
              )}
              {harvest.length > 0 && (
                <>
                  <p className="mb-0.5 mt-3 text-[0.6875rem] text-fg-3">Harvest candidates</p>
                  {harvest.slice(0, 4).map(([sym, loss]) => (
                    <div key={sym} className="flex items-center justify-between border-t border-line py-1.5 text-[0.75rem]">
                      <span className="font-medium">{sym}</span>
                      <span className="flex items-center gap-1.5">
                        {model.washSales.some((w) => w.symbol === sym) && <Chip tone="warn">Wash window</Chip>}
                        <span className="text-down">{money(loss)}</span>
                      </span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
