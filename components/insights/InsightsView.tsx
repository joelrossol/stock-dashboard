"use client";

import { BellOff, Clock, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { muteSymbolAction, snoozeSignalAction, unmuteSymbolAction, unsnoozeSignalAction } from "@/app/actions";
import { Card, Chip, SEVERITY_TONE } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { InsightGroup, Signal } from "@/lib/analytics/signals";
import { SignalIcon } from "./SignalIcon";

const TAX = new Set(["wash-sale", "lt-soon", "harvest"]);
const FILTERS = [
  ["all", "All"],
  ["warning", "Warnings"],
  ["caution", "Heads up"],
  ["opportunity", "Opportunities"],
  ["tax", "Tax"],
  ["info", "Info"],
] as const;
type Filter = (typeof FILTERS)[number][0];

export function InsightsView({ groups, suppressed, mutes }: { groups: InsightGroup[]; suppressed: Signal[]; mutes: string[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, start] = useTransition();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: groups.length };
    for (const g of groups) {
      c[g.severity] = (c[g.severity] ?? 0) + 1;
      if ([g.primary, ...g.related].some((s) => TAX.has(s.type))) c.tax = (c.tax ?? 0) + 1;
    }
    return c;
  }, [groups]);

  const shown = groups.filter((g) => {
    if (filter === "all") return true;
    if (filter === "tax") return [g.primary, ...g.related].some((s) => TAX.has(s.type));
    return g.severity === filter;
  });

  return (
    <div className={cn(pending && "opacity-70")}>
      <div className="mb-3 flex flex-wrap gap-1">
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn("rounded-lg px-2.5 py-1 text-[0.75rem]", filter === k ? "bg-card-2 text-fg" : "text-fg-3 hover:text-fg-2")}
          >
            {label} <span className="text-fg-3">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {shown.map((g) => {
          const s = g.primary;
          return (
            <Card key={g.key} className="flex flex-col gap-2">
              <div className="flex items-start gap-2.5">
                <SignalIcon signal={s} size={35} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[0.8125rem] font-medium">{s.title}</p>
                    <Chip tone={SEVERITY_TONE[s.severity]}>{s.tag}</Chip>
                  </div>
                  <p className="text-[0.7188rem] text-fg-2">{s.detail}</p>
                </div>
              </div>
              <ul className="ml-[2.375rem] flex flex-col gap-0.5 text-[0.6875rem] text-fg-3">
                {s.reasons.map((r) => (
                  <li key={r} className="before:mr-1.5 before:content-['·']">
                    {r}
                  </li>
                ))}
              </ul>
              {s.metrics.length > 0 && (
                <div className="ml-[2.375rem] flex flex-wrap gap-1">
                  {s.metrics.map((m) => (
                    <span key={m.label} className="rounded-md border border-line px-1.5 py-0.5 text-[0.6562rem]">
                      <span className="text-fg-3">{m.label}</span> <span className="text-fg-2">{m.value}</span>
                    </span>
                  ))}
                </div>
              )}
              {g.related.length > 0 && (
                <div className="ml-[2.375rem] flex flex-col gap-1 border-t border-line pt-2">
                  {g.related.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-[0.7188rem]">
                      <SignalIcon signal={r} size={22} />
                      <span className="truncate">{r.title}</span>
                      <span className="hidden truncate text-fg-3 sm:inline">· {r.detail}</span>
                      <button onClick={() => start(() => snoozeSignalAction(r.id, 7))} className="ml-auto shrink-0 text-fg-3 hover:text-fg-2" title="Snooze 7 days">
                        <Clock size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="ml-[2.375rem] flex flex-wrap items-center gap-3 text-[0.6875rem] text-fg-3">
                <button onClick={() => start(() => snoozeSignalAction(s.id, 7))} className="flex items-center gap-1 hover:text-fg-2">
                  <Clock size={15} /> Snooze 7 days
                </button>
                {s.symbol && (
                  <button onClick={() => start(() => muteSymbolAction(s.symbol!))} className="flex items-center gap-1 hover:text-fg-2">
                    <BellOff size={15} /> Mute {s.symbol}
                  </button>
                )}
                {s.symbol && (
                  <Link href={`/symbol/${s.symbol}`} className="ml-auto flex items-center gap-1 hover:text-fg-2">
                    Open {s.symbol} <ExternalLink size={14} />
                  </Link>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {(suppressed.length > 0 || mutes.length > 0) && (
        <Card className="mt-3">
          <h3 className="mb-1.5 text-[0.75rem] font-medium text-fg-2">Snoozed and muted</h3>
          {mutes.map((m) => (
            <div key={m} className="flex items-center gap-2 border-t border-line py-1.5 text-[0.75rem]">
              <BellOff size={16} className="text-fg-3" />
              <span>All insights for {m}</span>
              <button onClick={() => start(() => unmuteSymbolAction(m))} className="ml-auto text-[0.6875rem] text-fg-3 hover:text-fg-2">
                Unmute
              </button>
            </div>
          ))}
          {suppressed
            .filter((s) => !s.symbol || !mutes.includes(s.symbol))
            .map((s) => (
              <div key={s.id} className="flex items-center gap-2 border-t border-line py-1.5 text-[0.75rem]">
                <SignalIcon signal={s} size={22} />
                <span className="truncate">{s.title}</span>
                <button onClick={() => start(() => unsnoozeSignalAction(s.id))} className="ml-auto shrink-0 text-[0.6875rem] text-fg-3 hover:text-fg-2">
                  Unsnooze
                </button>
              </div>
            ))}
        </Card>
      )}
    </div>
  );
}
