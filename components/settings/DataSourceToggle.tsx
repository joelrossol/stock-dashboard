"use client";

import { Database, Radio } from "lucide-react";
import { useTransition } from "react";
import { setDataModeAction } from "@/app/actions";
import { cn } from "@/lib/cn";

/** Big two-way switch: live Schwab data vs the built-in sample portfolio. */
export function DataSourceToggle({ selected, live, liveNote }: { selected: "live" | "mock"; live: boolean; liveNote: string }) {
  const [pending, start] = useTransition();
  const option = (mode: "live" | "mock", title: string, note: string, Icon: typeof Radio) => {
    const on = selected === mode;
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => !on && start(() => setDataModeAction(mode))}
        className={cn(
          "flex flex-1 items-start gap-3 rounded-xl border p-3 text-left transition-colors",
          on ? "border-accent/70 bg-accent/12" : "border-line bg-bg hover:border-line-2",
          pending && "opacity-60",
        )}
        aria-pressed={on}
      >
        <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", on ? "bg-accent/25 text-fg" : "bg-white/5 text-fg-3")}>
          <Icon size={18} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[0.8125rem] font-medium">
            {title}
            <span className={cn("h-3.5 w-3.5 rounded-full border-2", on ? "border-accent bg-accent" : "border-line-2")} />
          </span>
          <span className="mt-0.5 block text-[0.7188rem] text-fg-3">{note}</span>
        </span>
      </button>
    );
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {option("live", "Live Schwab data", live ? "Your real accounts, refreshed every minute" : liveNote, Radio)}
      {option("mock", "Sample data", "The built-in demo portfolio, no connection needed", Database)}
    </div>
  );
}
