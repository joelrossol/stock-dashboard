"use client";

import { useState } from "react";
import { AreaChart } from "@/components/charts/AreaChart";
import { Chip } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/lib/cn";
import { money, pct, pts } from "@/lib/format";
import type { RangeKey, RangeSeries } from "@/lib/model";

const RANGE_TEXT: Record<RangeKey, string> = {
  "1D": "today",
  "1W": "past week",
  "1M": "past month",
  "3M": "past 3 months",
  YTD: "year to date",
  "1Y": "past year",
  ALL: "all time",
};

export function NetWorthCard({ series, total, label, height = 262 }: { series: RangeSeries[]; total: number; label: string; height?: number }) {
  const [key, setKey] = useState<RangeKey>("1D");
  const s = series.find((x) => x.key === key) ?? series[0];
  if (!s) return null;
  const up = s.gain >= 0;
  const vsBench = s.gainPct - s.benchPct;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[0.6875rem] text-fg-3">Net worth · {label}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="text-[1.875rem] font-medium leading-none tracking-tight">{money(total)}</span>
            <Chip tone={up ? "up" : "down"}>{pct(s.gainPct)}</Chip>
          </div>
          <p className="mt-1 text-[0.6875rem] text-fg-2">
            <span className={up ? "text-up" : "text-down"}>{money(s.gain, { cents: true, sign: true })}</span> {RANGE_TEXT[key]}
            {key !== "1D" && key !== "1W" && <span className="text-fg-3"> · excludes deposits</span>}
          </p>
        </div>
        <Segmented options={series.map((x) => x.key)} value={key} onChange={(v) => setKey(v as RangeKey)} />
      </div>
      <div className="mt-2 flex-1">
        <AreaChart
          points={s.points}
          height={height}
          deposits={s.deposits}
          animateKey={key}
          tone={up ? "up" : "down"}
          tooltip={(p, _i, first) => {
            const intraday = key === "1D" || key === "1W";
            const d = first.v ? p.v / first.v - 1 : 0;
            const b = p.b != null && first.b ? p.b / first.b - 1 : null;
            const vsShadow = p.b != null ? p.v - p.b : null;
            return (
              <>
                <div className="text-[0.6562rem] text-fg-3">{p.label}</div>
                <div className="text-[0.8125rem] font-medium">{money(p.v)}</div>
                {intraday ? (
                  <div className={d >= 0 ? "text-up" : "text-down"}>
                    {pct(d)}
                    {b != null && <span className="text-fg-3"> · S&amp;P {pct(b)}</span>}
                  </div>
                ) : (
                  vsShadow != null && (
                    <div className="text-fg-3">
                      vs S&amp;P shadow <span className={vsShadow >= 0 ? "text-up" : "text-down"}>{money(vsShadow, { sign: true })}</span>
                    </div>
                  )
                )}
              </>
            );
          }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6562rem] text-fg-3">
        <span className="flex items-center gap-1.5">
          <span className={cn("h-[2px] w-2.5 rounded", up ? "bg-up" : "bg-down")} />
          Portfolio
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 border-t-[1.5px] border-dashed border-fg-3" />
          {key === "1D" || key === "1W" ? "S&P 500" : "Same deposits in S&P 500"}
        </span>
        {s.deposits.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full border-[1.5px] border-accent" />
            Deposit
          </span>
        )}
        <span className="ml-auto">
          High {money(s.high)} · Low {money(s.low)} · vs S&amp;P <span className={vsBench >= 0 ? "text-up" : "text-down"}>{pts(vsBench)}</span>
        </span>
      </div>
    </div>
  );
}
