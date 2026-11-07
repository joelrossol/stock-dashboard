import Link from "next/link";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { pct } from "@/lib/format";
import { heat } from "./colors";

interface Item {
  symbol: string;
  value: number;
  changePct: number;
}

/** Squarified treemap laid out in a virtual canvas and rendered as % boxes. */
export function Treemap({ items, height = 188, aspect = 2.8 }: { items: Item[]; height?: number; aspect?: number }) {
  const W = 1000;
  const H = W / aspect;
  const root = hierarchy<{ children?: Item[] } & Partial<Item>>({ children: items })
    .sum((d) => (d as Item).value ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  treemap<{ children?: Item[] } & Partial<Item>>().tile(treemapSquarify.ratio(1.2)).size([W, H]).paddingInner(3).round(false)(root);
  const leaves = root.leaves() as unknown as { x0: number; x1: number; y0: number; y1: number; data: Item }[];
  return (
    <div className="relative w-full" style={{ height }}>
      {leaves.map((l) => {
        const w = l.x1 - l.x0;
        const h = l.y1 - l.y0;
        const { bg, fg } = heat(l.data.changePct);
        const big = w > 70 && h > 40;
        const tiny = w < 45 || h < 26;
        return (
          <Link
            key={l.data.symbol}
            href={`/symbol/${l.data.symbol}`}
            title={`${l.data.symbol} ${pct(l.data.changePct, { digits: 1 })}`}
            className="absolute overflow-hidden rounded-[0.3125rem] px-1.5 py-1 leading-tight transition-[filter] hover:brightness-125"
            style={{ left: `${(l.x0 / W) * 100}%`, top: `${(l.y0 / H) * 100}%`, width: `${(w / W) * 100}%`, height: `${(h / H) * 100}%`, background: bg, color: fg }}
          >
            {!tiny && <div className={big ? "text-[0.75rem] font-medium" : "text-[0.6562rem] font-medium"}>{l.data.symbol}</div>}
            {!tiny && <div className="text-[0.6562rem] opacity-80">{pct(l.data.changePct, { digits: 1 })}</div>}
          </Link>
        );
      })}
    </div>
  );
}
