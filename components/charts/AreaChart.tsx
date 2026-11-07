"use client";

import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { motion } from "motion/react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { money } from "@/lib/format";
import { C } from "./colors";
import { useWidth } from "./useWidth";

export interface AreaPoint {
  v: number;
  b?: number;
  label: string;
}

interface Props {
  points: AreaPoint[];
  height: number;
  tone?: "up" | "down" | "auto";
  deposits?: number[];
  showBench?: boolean;
  showGrid?: boolean;
  baseline?: boolean;
  animateKey?: string;
  rightPad?: number;
  formatAxis?: (v: number) => string;
  tooltip?: (p: AreaPoint, i: number, first: AreaPoint) => ReactNode;
}

export function AreaChart({
  points,
  height,
  tone = "auto",
  deposits = [],
  showBench = true,
  showGrid = true,
  baseline = true,
  animateKey,
  rightPad = 54,
  formatAxis = (v) => money(v, { compact: true }),
  tooltip,
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const n = points.length;
  const up = tone === "auto" ? (points.at(-1)?.v ?? 0) >= (points[0]?.v ?? 0) : tone === "up";
  const color = up ? C.up : C.down;
  const padR = showGrid ? rightPad : 4;

  const geo = useMemo(() => {
    if (width <= 0 || n < 2) return null;
    const vals = points.flatMap((p) => (showBench && p.b != null && Number.isFinite(p.b) ? [p.v, p.b] : [p.v]));
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.08 || hi * 0.01 || 1;
    const x = scaleLinear().domain([0, n - 1]).range([0, width - padR]);
    const y = scaleLinear().domain([lo - pad, hi + pad]).range([height - 6, 8]);
    const lineGen = line<AreaPoint>().x((_, i) => x(i)).y((p) => y(p.v)).curve(curveMonotoneX);
    const areaGen = area<AreaPoint>().x((_, i) => x(i)).y0(height).y1((p) => y(p.v)).curve(curveMonotoneX);
    const benchGen = line<AreaPoint>()
      .defined((p) => p.b != null && Number.isFinite(p.b))
      .x((_, i) => x(i))
      .y((p) => y(p.b!))
      .curve(curveMonotoneX);
    const ticks = [0.2, 0.5, 0.8].map((f) => lo + (hi - lo) * f);
    return { x, y, linePath: lineGen(points) ?? "", areaPath: areaGen(points) ?? "", benchPath: showBench ? (benchGen(points) ?? "") : "", ticks };
  }, [points, width, height, n, showBench, padR]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!geo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(geo.x.invert(e.clientX - rect.left));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const hp = hover != null ? points[hover] : null;
  const hx = hover != null && geo ? geo.x(hover) : 0;
  const hy = hp && geo ? geo.y(hp.v) : 0;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {geo && (
        <svg width={width} height={height} className="block overflow-visible" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <defs>
            <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {showGrid &&
            geo.ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={width - padR} y1={geo.y(t)} y2={geo.y(t)} stroke={C.grid} />
                <text x={width - padR + 6} y={geo.y(t) + 3} fill={C.fg3} fontSize={12.5}>
                  {formatAxis(t)}
                </text>
              </g>
            ))}
          <motion.path
            key={`a${animateKey}`}
            d={geo.areaPath}
            fill={`url(#g${gid})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
          {baseline && <line x1={0} x2={width - padR} y1={geo.y(points[0].v)} y2={geo.y(points[0].v)} stroke="rgba(255,255,255,0.16)" strokeDasharray="2 4" />}
          {showBench && geo.benchPath && <path d={geo.benchPath} fill="none" stroke={C.fg3} strokeWidth={1.25} strokeDasharray="3 4" />}
          <motion.path
            key={`l${animateKey}`}
            d={geo.linePath}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
          {deposits.map((i) => (
            <circle key={i} cx={geo.x(i)} cy={height - 5} r={3} fill={C.card} stroke={C.accent} strokeWidth={1.5}>
              <title>Deposit</title>
            </circle>
          ))}
          <circle className="live-ring" cx={geo.x(n - 1)} cy={geo.y(points[n - 1].v)} r={3.5} fill={color} />
          <circle cx={geo.x(n - 1)} cy={geo.y(points[n - 1].v)} r={3.5} fill={color} stroke={C.card} strokeWidth={2} />
          {hp && (
            <g pointerEvents="none">
              <line x1={hx} x2={hx} y1={0} y2={height} stroke="rgba(255,255,255,0.22)" />
              <circle cx={hx} cy={hy} r={4} fill={color} stroke={C.card} strokeWidth={2} />
            </g>
          )}
          <rect x={0} y={0} width={width} height={height} fill="transparent" />
        </svg>
      )}
      {hp && hover != null && geo && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-line-2 bg-card-2 px-2 py-1.5 text-[0.6875rem] shadow-lg"
          style={{ left: Math.min(Math.max(0, hx - 88), width - 190), top: hy > 88 ? Math.max(0, hy - 88) : hy + 18 }}
        >
          {tooltip ? tooltip(hp, hover, points[0]) : <DefaultTip p={hp} first={points[0]} />}
        </div>
      )}
    </div>
  );
}

function DefaultTip({ p, first }: { p: AreaPoint; first: AreaPoint }) {
  const d = first.v ? p.v / first.v - 1 : 0;
  return (
    <>
      <div className="text-[0.6562rem] text-fg-3">{p.label}</div>
      <div className="text-[0.8125rem] font-medium">{money(p.v)}</div>
      <div className={d >= 0 ? "text-up" : "text-down"}>{(d * 100).toFixed(2)}%</div>
    </>
  );
}
