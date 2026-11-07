import Link from "next/link";
import { area, curveMonotoneX, line } from "d3-shape";
import { C } from "@/components/charts/colors";
import { CardHeader, toneClass } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/dates";
import { money, pct, pts } from "@/lib/format";

export interface ScorecardData {
  /** Your return vs the S&P 500 over a few ranges (fractions). */
  periods: { key: string; you: number; spy: number }[];
  /** The trading session the day figures cover, e.g. "Fri Nov 6". */
  session: string;
  movers: { winners: { symbol: string; pl: number }[]; losers: { symbol: string; pl: number }[]; gained: number; lost: number; up: number; down: number };
  /** Drawdown from the time-weighted high (deposits excluded). */
  high: { drawdown: number; peakDate: string; sessionsSince: number; underwater: number[] };
  /** Your value minus the same deposits held in the S&P 500. */
  shadow: { ahead: number; since: string; diff: number[] } | null;
}

function Panel({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  const head = <p className="text-[0.6562rem] uppercase tracking-wide text-fg-3">{title}</p>;
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-line bg-bg/40 p-2">
      {href ? (
        <Link href={href} className="hover:text-fg-2">
          {head}
        </Link>
      ) : (
        head
      )}
      {children}
    </div>
  );
}

/** Paired bars (you vs S&P) for each range around a zero line. */
function PairedBars({ periods }: { periods: ScorecardData["periods"] }) {
  const W = 200;
  const H = 64;
  const max = Math.max(0.005, ...periods.flatMap((p) => [Math.abs(p.you), Math.abs(p.spy)]));
  const hasNeg = periods.some((p) => p.you < 0 || p.spy < 0);
  const hasPos = periods.some((p) => p.you > 0 || p.spy > 0);
  const zero = hasNeg && hasPos ? H / 2 : hasNeg ? 2 : H - 2;
  const scale = (hasNeg && hasPos ? H / 2 - 2 : H - 4) / max;
  const group = W / periods.length;
  const bw = Math.min(14, group / 3.2);
  const bar = (x: number, v: number, fill: string) => {
    const h = Math.max(1, Math.abs(v) * scale);
    return <rect x={x} y={v >= 0 ? zero - h : zero} width={bw} height={h} rx={2} fill={fill} />;
  };
  return (
    <div className="mt-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[3.25rem] w-full" preserveAspectRatio="none" aria-hidden>
        <line x1={0} x2={W} y1={zero} y2={zero} stroke={C.line} />
        {periods.map((p, i) => {
          const cx = group * i + group / 2;
          return (
            <g key={p.key}>
              {bar(cx - bw - 1, p.you, p.you >= 0 ? C.up : C.down)}
              {bar(cx + 1, p.spy, "rgba(255,255,255,0.22)")}
            </g>
          );
        })}
      </svg>
      <div className="mt-0.5 grid text-center text-[0.5938rem] leading-tight" style={{ gridTemplateColumns: `repeat(${periods.length}, 1fr)` }}>
        {periods.map((p) => (
          <div key={p.key}>
            <div className="text-fg-3">{p.key}</div>
            <div className={toneClass(p.you - p.spy)}>{pts(p.you - p.spy).replace(" pts", "")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Small area chart against a zero baseline. */
function MiniArea({ values, tone }: { values: number[]; tone: "up" | "down" }) {
  const W = 200;
  const H = 40;
  if (values.length < 2) return <div className="h-[2.5rem]" />;
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const y = (v: number) => 2 + ((hi - v) / span) * (H - 4);
  const x = (i: number) => (i / (values.length - 1)) * W;
  const color = tone === "up" ? C.up : C.down;
  const id = `mini-${tone}-${values.length}`;
  const fill = area<number>().x((_, i) => x(i)).y0(y(0)).y1(y).curve(curveMonotoneX)(values) ?? "";
  const stroke = line<number>().x((_, i) => x(i)).y(y).curve(curveMonotoneX)(values) ?? "";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1.5 h-[2.5rem] w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1={tone === "up" ? "0" : "1"} y2={tone === "up" ? "1" : "0"}>
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke={C.fg3} strokeDasharray="3 3" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
      <path d={fill} fill={`url(#${id})`} />
      <path d={stroke} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** "Am I doing well?" Four small views of the same question. */
export function ScorecardCard({ data }: { data: ScorecardData }) {
  const { periods, movers, high, shadow, session } = data;
  const beating = periods.filter((p) => p.you > p.spy).length;
  const net = movers.gained + movers.lost;
  const gross = movers.gained - movers.lost || 1;
  const atHigh = high.drawdown > -0.001;
  return (
    <div className="flex h-full flex-col">
      <CardHeader title="Scorecard" right="Am I doing well?" />
      <div className="grid flex-1 grid-cols-2 gap-1.5">
        <Panel title="You vs S&P" href="/performance">
          <p className="mt-1 text-[0.9375rem] font-medium leading-tight">
            <span className={beating >= periods.length / 2 ? "text-up" : "text-down"}>{beating}</span>
            <span className="text-fg-3"> of {periods.length}</span>
          </p>
          <p className="text-[0.6562rem] leading-tight text-fg-3">ranges ahead · lead in % pts</p>
          <PairedBars periods={periods} />
        </Panel>

        <Panel title={`Day's $ change · ${session}`}>
          <p className={`mt-1 text-[0.9375rem] font-medium leading-tight ${toneClass(net)}`}>{money(net, { sign: true })}</p>
          <p className="text-[0.6562rem] leading-tight text-fg-3">
            <span className="text-up">{movers.up} rose</span> · <span className="text-down">{movers.down} fell</span> · not total gain
          </p>
          <div className="mt-2 flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
            <div className="bg-up" style={{ flex: Math.max(movers.gained, 0.0001) / gross }} />
            <div className="bg-down" style={{ flex: Math.max(-movers.lost, 0.0001) / gross }} />
          </div>
          <div className="mt-0.5 flex justify-between text-[0.5938rem]">
            <span className="text-up">{money(movers.gained, { sign: true, compact: true })}</span>
            <span className="text-down">{money(movers.lost, { sign: true, compact: true })}</span>
          </div>
          <div className="mt-1.5 flex flex-col text-[0.6562rem] leading-snug">
            {[...movers.winners, ...movers.losers].map((w) => (
              <Link key={w.symbol} href={`/symbol/${w.symbol}`} className="flex justify-between gap-1 hover:underline">
                <span className="truncate">{w.symbol}</span>
                <span className={toneClass(w.pl)}>{money(w.pl, { sign: true, compact: true })}</span>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title="From your high" href="/performance">
          <p className={`mt-1 text-[0.9375rem] font-medium leading-tight ${atHigh ? "text-up" : "text-down"}`}>{atHigh ? "At a high" : pct(high.drawdown, { digits: 1 })}</p>
          <p className="truncate text-[0.6562rem] text-fg-3">
            {atHigh ? "New peak, deposits excluded" : `Peak ${fmtDate(high.peakDate, "short")} · ${high.sessionsSince}d ago`}
          </p>
          <div className="mt-auto">
            <MiniArea values={high.underwater} tone={atHigh ? "up" : "down"} />
            <p className="text-[0.5938rem] text-fg-3">Past year, below peak</p>
          </div>
        </Panel>

        <Panel title="vs S&P shadow" href="/performance">
          {shadow ? (
            <>
              <p className={`mt-1 text-[0.9375rem] font-medium leading-tight ${toneClass(shadow.ahead)}`}>
                {shadow.ahead >= 0 ? "Ahead " : "Behind "}
                {money(Math.abs(shadow.ahead))}
              </p>
              <p className="truncate text-[0.6562rem] text-fg-3">Same deposits since {fmtDate(shadow.since, "month")}</p>
              <div className="mt-auto">
                <MiniArea values={shadow.diff} tone={shadow.ahead >= 0 ? "up" : "down"} />
                <p className="text-[0.5938rem] text-fg-3">Your lead over time</p>
              </div>
            </>
          ) : (
            <p className="mt-2 text-[0.6875rem] text-fg-3">Not enough history yet</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
