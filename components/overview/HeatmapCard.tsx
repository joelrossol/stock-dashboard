"use client";

import { Treemap } from "@/components/charts/Treemap";
import { CardHeader, toneClass } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/Segmented";
import { usePersistentState } from "@/components/ui/usePersistentState";
import { money, pct } from "@/lib/format";

export interface HeatmapHolding {
  symbol: string;
  value: number;
  dayPct: number;
  dayPL: number;
  weekPct: number | null;
}

const PERIODS = ["Day", "Week"] as const;

export function HeatmapCard({ holdings }: { holdings: HeatmapHolding[] }) {
  const [period, setPeriod] = usePersistentState("heatmap-period", "Day", PERIODS);
  const week = period === "Week";
  const items = holdings.map((h) => {
    const changePct = week ? (h.weekPct ?? 0) : h.dayPct;
    // Weekly $ is estimated from today's value and the 5-day return.
    const change = week ? h.value - h.value / (1 + changePct) : h.dayPL;
    return { symbol: h.symbol, value: h.value, changePct, change };
  });
  const total = items.reduce((s, i) => s + i.change, 0);
  return (
    <>
      <CardHeader
        title="Heatmap"
        right={
          <div className="flex items-center gap-2">
            <span>
              {week ? "Past week" : "Today"} <span className={toneClass(total)}>{money(total, { sign: true })}</span>
            </span>
            <Segmented options={PERIODS} value={period} onChange={(v) => setPeriod(v as (typeof PERIODS)[number])} />
          </div>
        }
      />
      <Treemap items={items} height={250} aspect={3.2} />
      <p className="mt-1.5 text-[0.6562rem] text-fg-3">
        Size = value · color = {week ? "5-day" : "today's"} change{week ? ` · ${pct(holdings.length ? items.filter((i) => i.changePct > 0).length / holdings.length : 0, { digits: 0, sign: false })} of holdings up this week` : ""}
      </p>
    </>
  );
}
