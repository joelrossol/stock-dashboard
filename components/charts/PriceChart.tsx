"use client";

import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { motion } from "motion/react";
import { useId, useMemo, useState } from "react";
import { sma } from "@/lib/analytics/indicators";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/dates";
import { compactNumber, pct, price } from "@/lib/format";
import { Segmented } from "@/components/ui/Segmented";
import { C } from "./colors";
import { useWidth } from "./useWidth";

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradeMarker {
  date: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  account?: string;
}

const RANGES = [
  ["1M", 21],
  ["3M", 63],
  ["6M", 126],
  ["1Y", 252],
  ["3Y", 756],
] as const;

const SMAS = [
  { n: 20, color: "#C9A46A" },
  { n: 50, color: "#6B8FC2" },
  { n: 200, color: "#B07A9E" },
] as const;

export function PriceChart({
  bars,
  markers = [],
  height = 375,
  initialRange = "1Y",
  compact = false,
  focusDate,
}: {
  bars: PriceBar[];
  markers?: TradeMarker[];
  height?: number;
  initialRange?: (typeof RANGES)[number][0];
  compact?: boolean;
  focusDate?: string;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number][0]>(initialRange);
  const [shown, setShown] = useState<Record<number, boolean>>({ 20: false, 50: !compact, 200: !compact });
  const [candles, setCandles] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const gid = useId().replace(/:/g, "");

  const smaAll = useMemo(() => {
    const closes = bars.map((b) => b.close);
    return Object.fromEntries(SMAS.map((s) => [s.n, sma(closes, s.n)])) as Record<number, (number | null)[]>;
  }, [bars]);

  const count = RANGES.find((r) => r[0] === range)![1];
  const start = Math.max(0, bars.length - count);
  const view = bars.slice(start);
  const n = view.length;
  const volH = compact ? 0 : 45;
  const plotH = height - volH - 4;
  const padR = 60;

  const geo = useMemo(() => {
    if (width <= 0 || n < 2) return null;
    const lows = view.map((b) => (candles ? b.low : b.close));
    const highs = view.map((b) => (candles ? b.high : b.close));
    for (const s of SMAS) {
      if (!shown[s.n]) continue;
      for (let i = 0; i < n; i++) {
        const v = smaAll[s.n][start + i];
        if (v != null) {
          lows.push(v);
          highs.push(v);
        }
      }
    }
    const lo = Math.min(...lows);
    const hi = Math.max(...highs);
    const pad = (hi - lo) * 0.06 || 1;
    const x = scaleLinear().domain([0, n - 1]).range([4, width - padR]);
    const y = scaleLinear().domain([lo - pad, hi + pad]).range([plotH - 4, 6]);
    const maxVol = Math.max(...view.map((b) => b.volume)) || 1;
    const vy = scaleLinear().domain([0, maxVol]).range([0, volH]);
    const closeLine = line<PriceBar>().x((_, i) => x(i)).y((b) => y(b.close)).curve(curveMonotoneX)(view) ?? "";
    const closeArea = area<PriceBar>().x((_, i) => x(i)).y0(plotH).y1((b) => y(b.close)).curve(curveMonotoneX)(view) ?? "";
    const smaPaths = SMAS.filter((s) => shown[s.n]).map((s) => ({
      ...s,
      d:
        line<number | null>()
          .defined((v) => v != null)
          .x((_, i) => x(i))
          .y((v) => y(v as number))
          .curve(curveMonotoneX)(smaAll[s.n].slice(start)) ?? "",
    }));
    const ticks = [0.15, 0.5, 0.85].map((f) => lo + (hi - lo) * f);
    return { x, y, vy, closeLine, closeArea, smaPaths, ticks };
  }, [width, n, view, candles, shown, smaAll, start, plotH, volH]);

  const up = (view.at(-1)?.close ?? 0) >= (view[0]?.close ?? 0);
  const color = up ? C.up : C.down;
  const dateIndex = new Map(view.map((b, i) => [b.date, i]));
  const visibleMarkers = markers.filter((m) => dateIndex.has(m.date));
  const focusIdx = focusDate ? dateIndex.get(focusDate) : undefined;
  const hb = hover != null ? view[hover] : null;
  const barW = geo ? Math.max(1, Math.min(8, ((width - padR) / n) * 0.65)) : 1;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented options={RANGES.map((r) => r[0])} value={range} onChange={(v) => setRange(v as typeof range)} />
        {!compact && (
          <div className="flex items-center gap-1">
            {SMAS.map((s) => (
              <button
                key={s.n}
                onClick={() => setShown((p) => ({ ...p, [s.n]: !p[s.n] }))}
                className={cn("flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.6562rem]", shown[s.n] ? "border-line-2 text-fg" : "border-line text-fg-3")}
              >
                <span className="h-[2px] w-2.5 rounded" style={{ background: s.color, opacity: shown[s.n] ? 1 : 0.4 }} />
                {s.n}d
              </button>
            ))}
            <button
              onClick={() => setCandles((c) => !c)}
              className={cn("rounded-md border px-1.5 py-0.5 text-[0.6562rem]", candles ? "border-accent/60 bg-accent/15 text-fg" : "border-line text-fg-3")}
              title="Candlesticks"
            >
              Pro
            </button>
          </div>
        )}
        <div className="ml-auto text-[0.6875rem] text-fg-3">
          {hb ? (
            <span>
              {fmtDate(hb.date)} · O {price(hb.open)} H {price(hb.high)} L {price(hb.low)} C <span className="text-fg">{price(hb.close)}</span>
            </span>
          ) : (
            <span className={up ? "text-up" : "text-down"}>{pct((view.at(-1)?.close ?? 0) / (view[0]?.close || 1) - 1)} over {range}</span>
          )}
        </div>
      </div>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {geo && (
          <svg
            width={width}
            height={height}
            className="block overflow-visible"
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setHover(Math.max(0, Math.min(n - 1, Math.round(geo.x.invert(e.clientX - r.left)))));
            }}
            onPointerLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={`p${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.24} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {geo.ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={width - padR} y1={geo.y(t)} y2={geo.y(t)} stroke={C.grid} />
                <text x={width - padR + 6} y={geo.y(t) + 3} fill={C.fg3} fontSize={12.5}>
                  {price(t)}
                </text>
              </g>
            ))}
            {focusIdx != null && <rect x={geo.x(focusIdx) - 6} y={0} width={12} height={plotH} fill="rgba(142,120,196,0.12)" rx={3} />}
            {!candles && (
              <>
                <motion.path key={`a${range}`} d={geo.closeArea} fill={`url(#p${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} />
                <motion.path
                  key={`l${range}`}
                  d={geo.closeLine}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                />
              </>
            )}
            {candles &&
              view.map((b, i) => {
                const cx = geo.x(i);
                const c = b.close >= b.open ? C.up : C.down;
                const top = geo.y(Math.max(b.open, b.close));
                const bot = geo.y(Math.min(b.open, b.close));
                return (
                  <g key={b.date}>
                    <line x1={cx} x2={cx} y1={geo.y(b.high)} y2={geo.y(b.low)} stroke={c} strokeWidth={1} />
                    <rect x={cx - barW / 2} y={top} width={barW} height={Math.max(1, bot - top)} fill={c} rx={1} />
                  </g>
                );
              })}
            {geo.smaPaths.map((s) => (
              <path key={s.n} d={s.d} fill="none" stroke={s.color} strokeWidth={1.2} strokeOpacity={0.85} />
            ))}
            {volH > 0 &&
              view.map((b, i) => (
                <rect key={b.date} x={geo.x(i) - barW / 2} y={height - geo.vy(b.volume)} width={barW} height={geo.vy(b.volume)} fill="rgba(255,255,255,0.08)" rx={1} />
              ))}
            {visibleMarkers.map((m, k) => {
              const i = dateIndex.get(m.date)!;
              const cx = geo.x(i);
              const cy = geo.y(m.price);
              const buy = m.side === "BUY";
              const path = buy ? `M${cx},${cy + 4} l5,9 l-10,0 z` : `M${cx},${cy - 4} l5,-9 l-10,0 z`;
              return (
                <path key={k} d={path} fill={buy ? C.up : C.down} stroke={C.card} strokeWidth={1}>
                  <title>{`${buy ? "Bought" : "Sold"} ${m.qty} @ ${price(m.price)}${m.account ? ` · ${m.account}` : ""} · ${fmtDate(m.date)}`}</title>
                </path>
              );
            })}
            {hb && hover != null && (
              <g pointerEvents="none">
                <line x1={geo.x(hover)} x2={geo.x(hover)} y1={0} y2={plotH} stroke="rgba(255,255,255,0.2)" />
                <circle cx={geo.x(hover)} cy={geo.y(hb.close)} r={3.5} fill={color} stroke={C.card} strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between text-[0.6562rem] text-fg-3">
          <span>{view[0] && fmtDate(view[0].date)}</span>
          <span>Vol {hb ? compactNumber(hb.volume) : compactNumber(view.at(-1)?.volume ?? 0)}</span>
          <span>{view.at(-1) && fmtDate(view.at(-1)!.date)}</span>
        </div>
      )}
    </div>
  );
}
