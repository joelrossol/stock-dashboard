"use client";

import { AreaChart } from "@/components/charts/AreaChart";
import { money } from "@/lib/format";
import type { RangeSeries } from "@/lib/model";

export function ShadowChart({ series }: { series: RangeSeries }) {
  return (
    <AreaChart
      points={series.points}
      deposits={series.deposits}
      height={275}
      animateKey="shadow"
      tooltip={(p) => {
        const diff = p.b != null ? p.v - p.b : 0;
        return (
          <>
            <div className="text-[0.6562rem] text-fg-3">{p.label}</div>
            <div className="text-[0.8125rem] font-medium">{money(p.v)}</div>
            {p.b != null && (
              <div className="text-fg-3">
                S&amp;P shadow {money(p.b)} · <span className={diff >= 0 ? "text-up" : "text-down"}>{money(diff, { sign: true })}</span>
              </div>
            )}
          </>
        );
      }}
    />
  );
}
