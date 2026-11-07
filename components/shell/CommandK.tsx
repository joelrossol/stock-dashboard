"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setScopeAction } from "@/app/actions";
import { cn } from "@/lib/cn";
import { pct } from "@/lib/format";
import { NAV, SETTINGS_NAV } from "./nav";

export interface PaletteSymbol {
  symbol: string;
  name: string;
  changePct: number;
  held: boolean;
  watched: boolean;
}

export function CommandK({ symbols, accounts }: { symbols: PaletteSymbol[]; accounts: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const held = symbols.filter((s) => s.held);
  const watched = symbols.filter((s) => !s.held && s.watched);
  const others = symbols.filter((s) => !s.held && !s.watched);

  const row = (s: PaletteSymbol) => (
    <Command.Item
      key={s.symbol}
      value={`${s.symbol} ${s.name}`}
      onSelect={() => go(`/symbol/${s.symbol}`)}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-[0.7812rem] data-[selected=true]:bg-card-3"
    >
      <span className="w-12 font-medium">{s.symbol}</span>
      <span className="min-w-0 flex-1 truncate text-fg-2">{s.name}</span>
      <span className={s.changePct >= 0 ? "text-up" : "text-down"}>{pct(s.changePct, { digits: 1 })}</span>
    </Command.Item>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-card px-2.5 text-[0.75rem] text-fg-3 hover:border-line-2 md:max-w-md"
      >
        <Search size={16} />
        <span className="truncate">Search ticker or page</span>
        <kbd className="ml-auto hidden rounded border border-line px-1.5 text-[0.6562rem] sm:inline">⌘K</kbd>
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-[14vh] z-50 w-[min(560px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line-2 bg-card-2 shadow-2xl">
            <Dialog.Title className="sr-only">Search</Dialog.Title>
            <Command loop className="flex flex-col">
              <div className="flex items-center gap-2 border-b border-line px-3">
                <Search size={19} className="text-fg-3" />
                <Command.Input autoFocus placeholder="NVDA, Holdings, Roth…" className="h-11 flex-1 bg-transparent text-[0.875rem] outline-none placeholder:text-fg-3" />
              </div>
              <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
                <Command.Empty className="px-3 py-6 text-center text-[0.75rem] text-fg-3">No matches</Command.Empty>
                <Command.Group heading="Pages" className={groupCls}>
                  {[...NAV, SETTINGS_NAV].map((n) => (
                    <Command.Item key={n.href} value={`page ${n.label}`} onSelect={() => go(n.href)} className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-[0.7812rem] data-[selected=true]:bg-card-3">
                      <n.icon size={19} className="text-fg-3" />
                      {n.label}
                    </Command.Item>
                  ))}
                </Command.Group>
                <Command.Group heading="Show account" className={groupCls}>
                  {[{ id: "all", name: "All accounts" }, ...accounts].map((a) => (
                    <Command.Item
                      key={a.id}
                      value={`account ${a.name}`}
                      onSelect={() => {
                        setOpen(false);
                        start(() => setScopeAction(a.id));
                      }}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-[0.7812rem] data-[selected=true]:bg-card-3"
                    >
                      <span className="w-[0.9375rem] text-center text-fg-3">◎</span>
                      {a.name}
                    </Command.Item>
                  ))}
                </Command.Group>
                {held.length > 0 && (
                  <Command.Group heading="Your holdings" className={groupCls}>
                    {held.map(row)}
                  </Command.Group>
                )}
                {watched.length > 0 && (
                  <Command.Group heading="Watchlist" className={groupCls}>
                    {watched.map(row)}
                  </Command.Group>
                )}
                {others.length > 0 && (
                  <Command.Group heading="Other symbols" className={groupCls}>
                    {others.map(row)}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

const groupCls = cn("[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[0.6562rem] [&_[cmdk-group-heading]]:text-fg-3");
