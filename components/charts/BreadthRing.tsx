import { pct } from "@/lib/format";
import { C } from "./colors";

/** One segment per holding, sorted best → worst; opacity scales with the move. */
export function BreadthRing({ items, size = 165 }: { items: { symbol: string; pct: number }[]; size?: number }) {
  const sorted = [...items].sort((a, b) => b.pct - a.pct);
  const n = sorted.length || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 11;
  const gap = n > 40 ? 1 : 2.2;
  const up = sorted.filter((s) => s.pct > 0).length;
  const polar = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${up} of ${n} holdings up today`}>
      {sorted.map((h, i) => {
        const a0 = -90 + (i * 360) / n + gap / 2;
        const a1 = -90 + ((i + 1) * 360) / n - gap / 2;
        const [x0, y0] = polar(a0);
        const [x1, y1] = polar(a1);
        const large = a1 - a0 > 180 ? 1 : 0;
        const op = 0.42 + (Math.min(Math.abs(h.pct) * 100, 4) / 4) * 0.58;
        return (
          <path
            key={h.symbol}
            d={`M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`}
            fill="none"
            stroke={h.pct >= 0 ? C.up : C.down}
            strokeOpacity={op}
            strokeWidth={11}
          >
            <title>{`${h.symbol} ${pct(h.pct, { digits: 1 })}`}</title>
          </path>
        );
      })}
      <text x={cx} y={cy - 1} textAnchor="middle" fill={C.fg} fontSize={27.5} fontWeight={500}>
        {up}/{n}
      </text>
      <text x={cx} y={cy + 19} textAnchor="middle" fill={C.fg3} fontSize={12.5}>
        up today · {Math.round((up / n) * 100)}%
      </text>
    </svg>
  );
}
