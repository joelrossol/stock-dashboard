"use client";

import { cn } from "@/lib/cn";

export function Segmented({ options, value, onChange, className }: { options: readonly string[]; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={cn("flex gap-px rounded-lg border border-line bg-bg p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cn("rounded-md px-2 py-0.5 text-[0.6875rem] transition-colors", o === value ? "bg-card-2 text-fg" : "text-fg-3 hover:text-fg-2")}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
