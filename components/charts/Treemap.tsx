import Link from "next/link";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { money, pct } from "@/lib/format";
import { heat } from "./colors";

export interface TreemapItem {
  symbol: string;
  value: number;
  changePct: number;
  /** Dollar change over the same period, shown under the percentage when there's room. */
  change?: number;
}

/** Label sizes by tile size (virtual units on a 1000-wide canvas). Bigger tiles get bigger type. */
function sizeOf(w: number, h: number) {
  const area = w * h;
  if (w > 200 && h > 100 && area > 30_000) return { sym: "text-[1.125rem]", sub: "text-[0.8125rem]", lines: 3 };
  if (w > 130 && h > 70) return { sym: "text-[0.9375rem]", sub: "text-[0.7188rem]", lines: 3 };
  if (w > 75 && h > 48) return { sym: "text-[0.75rem]", sub: "text-[0.6562rem]", lines: 3 };
  if (w > 45 && h > 34) return { sym: "text-[0.6562rem]", sub: "text-[0.5938rem]", lines: 2 };
  if (w > 32 && h > 22) return { sym: "text-[0.5938rem]", sub: "", lines: 1 };
  return null;
}

/** Squarified treemap laid out in a virtual canvas and rendered as % boxes. */
export function Treemap({ items, height = 188, aspect = 2.8 }: { items: TreemapItem[]; height?: number; aspect?: number }) {
  const W = 1000;
  const H = W / aspect;
  const root = hierarchy<{ children?: TreemapItem[] } & Partial<TreemapItem>>({ children: items })
    .sum((d) => (d as TreemapItem).value ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  treemap<{ children?: TreemapItem[] } & Partial<TreemapItem>>().tile(treemapSquarify.ratio(1.2)).size([W, H]).paddingInner(3).round(false)(root);
  const leaves = root.leaves() as unknown as { x0: number; x1: number; y0: number; y1: number; data: TreemapItem }[];
  return (
    <div className="relative w-full" style={{ height }}>
      {leaves.map((l) => {
        const w = l.x1 - l.x0;
        const h = l.y1 - l.y0;
        const { bg, fg } = heat(l.data.changePct);
        const size = sizeOf(w, h);
        const dollars = l.data.change != null ? money(l.data.change, { sign: true, compact: Math.abs(l.data.change) >= 10_000 }) : null;
        return (
          <Link
            key={l.data.symbol}
            href={`/symbol/${l.data.symbol}`}
            title={`${l.data.symbol} ${pct(l.data.changePct, { digits: 1 })}${dollars ? ` · ${dollars}` : ""}`}
            className="absolute overflow-hidden rounded-[0.3125rem] px-1.5 py-1 leading-tight transition-[filter] hover:brightness-125"
            style={{ left: `${(l.x0 / W) * 100}%`, top: `${(l.y0 / H) * 100}%`, width: `${(w / W) * 100}%`, height: `${(h / H) * 100}%`, background: bg, color: fg }}
          >
            {size && <div className={`${size.sym} font-medium`}>{l.data.symbol}</div>}
            {size && size.lines >= 2 && <div className={`${size.sub} opacity-85`}>{pct(l.data.changePct, { digits: 1 })}</div>}
            {size && size.lines >= 3 && dollars && <div className={`${size.sub} opacity-70`}>{dollars}</div>}
          </Link>
        );
      })}
    </div>
  );
}
