"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SignalIcon } from "@/components/insights/SignalIcon";
import { Chip, SEVERITY_TONE } from "@/components/ui/primitives";
import type { InsightGroup } from "@/lib/analytics/signals";

export function InsightsBell({ groups, urgent }: { groups: InsightGroup[]; urgent: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-fg-2 hover:border-line-2" aria-label="Insights">
        <Bell size={19} />
        {urgent > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-warn px-1 text-center text-[0.5938rem] font-medium leading-4 text-bg">{urgent}</span>}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed bottom-0 right-0 top-0 z-50 flex w-[min(400px,100vw)] flex-col border-l border-line-2 bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <Dialog.Title className="text-[0.875rem] font-medium">Insights</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-fg-3 hover:bg-card-2 hover:text-fg" aria-label="Close">
              <X size={20} />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {groups.slice(0, 14).map(({ key, primary: s, related }) => (
              <Link key={key} href={s.symbol ? `/symbol/${s.symbol}` : "/insights"} onClick={() => setOpen(false)} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0 hover:opacity-90">
                <SignalIcon signal={s} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.7812rem]">{s.title}</div>
                  <div className="truncate text-[0.6875rem] text-fg-3">
                    {s.detail}
                    {related.length > 0 && ` · +${related.length} more`}
                  </div>
                </div>
                <Chip tone={SEVERITY_TONE[s.severity]}>{s.tag}</Chip>
              </Link>
            ))}
          </div>
          <Link href="/insights" onClick={() => setOpen(false)} className="border-t border-line px-4 py-3 text-center text-[0.75rem] text-fg-2 hover:text-fg">
            View all {groups.length} insights
          </Link>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
