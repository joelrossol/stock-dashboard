import { money, pct } from "@/lib/format";
import { SECTOR_COLORS } from "./colors";
import type { Segment } from "./AllocationBar";

const OTHER = "#3B3A47";

function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => `${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}`;
  return `M ${p(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}

/** Donut-style pie with the total in the middle and a legend beside it. */
export function PieChart({ segments, max = 7, center }: { segments: Segment[]; max?: number; center?: { label: string; value: string } }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const sorted = [...segments].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, max);
  const rest = sorted.slice(max).reduce((s, x) => s + x.value, 0);
  const shown = (rest > 0 ? [...head, { label: `${sorted.length - max} more`, value: rest, color: OTHER }] : head).map((s, i) => ({
    ...s,
    color: s.color ?? SECTOR_COLORS[i % SECTOR_COLORS.length],
  }));

  const size = 120;
  const c = size / 2;
  const gap = shown.length > 1 ? 0.025 : 0;
  const sweeps = shown.map((s) => (total > 0 ? (s.value / total) * Math.PI * 2 : 0));
  const starts = sweeps.map((_, i) => sweeps.slice(0, i).reduce((x, y) => x + y, 0));
  const slices = shown.map((s, i) => {
    const sweep = sweeps[i];
    const a0 = starts[i] + gap / 2;
    const a1 = starts[i] + Math.max(sweep - gap / 2, gap / 2 + 0.0001);
    return { ...s, d: sweep >= Math.PI * 2 - 0.001 ? null : arc(c, c, 38, 58, a0, a1) };
  });

  return (
    <div className="flex items-center gap-3">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-[7.5rem] w-[7.5rem] shrink-0" role="img" aria-label="Allocation pie chart">
        {total <= 0 && <circle cx={c} cy={c} r={48} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={20} />}
        {slices.map((s) =>
          s.d ? (
            <path key={s.label} d={s.d} fill={s.color}>
              <title>{`${s.label} · ${pct(s.value / total, { digits: 1, sign: false })} · ${money(s.value)}`}</title>
            </path>
          ) : (
            <circle key={s.label} cx={c} cy={c} r={48} fill="none" stroke={s.color} strokeWidth={20}>
              <title>{`${s.label} · 100%`}</title>
            </circle>
          ),
        )}
        {center && (
          <>
            <text x={c} y={c - 3} textAnchor="middle" className="fill-fg-3" style={{ fontSize: 8.5 }}>
              {center.label}
            </text>
            <text x={c} y={c + 10} textAnchor="middle" className="fill-fg" style={{ fontSize: 12, fontWeight: 500 }}>
              {center.value}
            </text>
          </>
        )}
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {slices.map((s) => (
          <div key={s.label} className="flex min-w-0 items-center gap-1.5 text-[0.6875rem]" title={money(s.value)}>
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
            <span className="truncate text-fg-2">{s.label}</span>
            <span className="ml-auto pl-1 text-fg-3">{pct(total > 0 ? s.value / total : 0, { digits: 1, sign: false })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
