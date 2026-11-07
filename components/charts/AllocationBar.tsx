import { pct } from "@/lib/format";
import { SECTOR_COLORS } from "./colors";

export interface Segment {
  label: string;
  value: number;
  color?: string;
}

export function AllocationBar({ segments, height = 10, legend = true, max = 8 }: { segments: Segment[]; height?: number; legend?: boolean; max?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const sorted = [...segments].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, max);
  const rest = sorted.slice(max).reduce((s, x) => s + x.value, 0);
  const shown = rest > 0 ? [...head, { label: "Other", value: rest, color: "#3B3A47" }] : head;
  return (
    <div>
      <div className="flex w-full gap-[2px] overflow-hidden rounded-full" style={{ height }}>
        {shown.map((s, i) => (
          <div key={s.label} title={`${s.label} ${pct(s.value / total, { digits: 1, sign: false })}`} style={{ flex: s.value, background: s.color ?? SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
        ))}
      </div>
      {legend && (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {shown.map((s, i) => (
            <div key={s.label} className="flex min-w-0 items-center gap-1.5 text-[0.6875rem]">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.color ?? SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
              <span className="truncate text-fg-2">{s.label}</span>
              <span className="ml-auto text-fg-3">{pct(s.value / total, { digits: 1, sign: false })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
