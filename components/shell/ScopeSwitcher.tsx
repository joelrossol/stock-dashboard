"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { useTransition } from "react";
import { setScopeAction } from "@/app/actions";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

export interface ScopeOption {
  id: string;
  name: string;
  mask?: string;
  value: number;
  color?: string;
  tax?: string;
}

export function ScopeSwitcher({ options, current }: { options: ScopeOption[]; current: string }) {
  const [pending, start] = useTransition();
  const active = options.find((o) => o.id === current) ?? options[0];
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className={cn(
          "flex h-8 min-w-0 items-center gap-2 rounded-lg border border-line bg-card px-2.5 text-[0.75rem] outline-none hover:border-line-2 data-[state=open]:border-line-2",
          pending && "opacity-60",
        )}
      >
        {active.color && <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: active.color }} />}
        <span className="truncate">{active.name}</span>
        <span className="hidden text-fg-3 sm:inline">{money(active.value, { compact: true })}</span>
        <ChevronDown size={16} className="shrink-0 text-fg-3" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className="z-50 min-w-[16.25rem] rounded-xl border border-line-2 bg-card-2 p-1 shadow-2xl">
          {options.map((o, i) => (
            <div key={o.id}>
              {i === 1 && <DropdownMenu.Separator className="my-1 h-px bg-line" />}
              <DropdownMenu.Item
                onSelect={() => start(() => setScopeAction(o.id))}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.75rem] outline-none data-[highlighted]:bg-card-3"
              >
                <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: o.color ?? "transparent", border: o.color ? undefined : "1px solid rgba(255,255,255,0.25)" }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{o.name}</div>
                  {(o.mask || o.tax) && <div className="text-[0.6562rem] text-fg-3">{[o.mask, o.tax].filter(Boolean).join(" · ")}</div>}
                </div>
                <span className="text-fg-2">{money(o.value)}</span>
                <Check size={16} className={cn("text-up", o.id === current ? "opacity-100" : "opacity-0")} />
              </DropdownMenu.Item>
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
