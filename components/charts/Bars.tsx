import Link from "next/link";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { C } from "./colors";

/** Diverging horizontal bars around zero (e.g. contribution to return). */
export function DivergingBars({ rows, format = (v: number) => money(v, { sign: true }) }: { rows: { label: string; value: number; href?: string; sub?: string }[]; format?: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r) => {
        const w = (Math.abs(r.value) / max) * 50;
        const up = r.value >= 0;
        const label = r.href ? (
          <Link href={r.href} className="hover:underline">
            {r.label}
          </Link>
        ) : (
          r.label
        );
        return (
          <div key={r.label} className="grid grid-cols-[52px_1fr_76px] items-center gap-2 text-[0.7188rem]">
            <span className="truncate font-medium">{label}</span>
            <div className="relative h-3.5">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line-2" />
              <div
                className={cn("absolute inset-y-0.5 rounded-[3px]", up ? "rounded-l-none" : "rounded-r-none")}
                style={{ left: up ? "50%" : `${50 - w}%`, width: `${w}%`, background: up ? C.up : C.down, opacity: 0.85 }}
              />
            </div>
            <span className={cn("text-right", up ? "text-up" : "text-down")}>{format(r.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Simple vertical bars with labels (e.g. monthly income). */
export function ColumnBars({ rows, height = 138, color = C.sage }: { rows: { label: string; value: number; highlight?: boolean }[]; height?: number; color?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height: height + 38 }}>
      {rows.map((r) => (
        <div key={r.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-[0.5938rem] text-fg-3">{r.value >= 1 ? money(r.value, { compact: true }) : ""}</span>
          <div className="w-full max-w-[1.5rem] rounded-t-[0.25rem]" style={{ height: Math.max(2, (r.value / max) * height), background: color, opacity: r.highlight ? 1 : 0.6 }} />
          <span className="text-[0.5938rem] text-fg-3">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Correlation matrix as a small heat grid. */
export function CorrelationGrid({ symbols, matrix }: { symbols: string[]; matrix: number[][] }) {
  const cell = (v: number) => {
    const a = Math.max(0, Math.min(1, Math.abs(v)));
    return v >= 0 ? `rgba(142,120,196,${0.08 + a * 0.75})` : `rgba(110,156,134,${0.08 + a * 0.75})`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="text-[0.625rem]">
        <thead>
          <tr>
            <th />
            {symbols.map((s) => (
              <th key={s} className="px-0.5 pb-1 font-normal text-fg-3">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((r, i) => (
            <tr key={r}>
              <td className="pr-1.5 text-right text-fg-3">{r}</td>
              {symbols.map((c, j) => (
                <td key={c} className="p-[1px]">
                  <div className="flex h-6 w-9 items-center justify-center rounded-[3px] text-fg" style={{ background: i === j ? "rgba(255,255,255,0.04)" : cell(matrix[i][j]) }} title={`${r} / ${c}: ${matrix[i][j].toFixed(2)}`}>
                    {i === j ? "" : matrix[i][j].toFixed(1)}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
