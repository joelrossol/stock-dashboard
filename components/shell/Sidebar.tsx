"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { usePersistentState } from "@/components/ui/usePersistentState";
import { cn } from "@/lib/cn";
import { MarketStatus } from "./MarketStatus";
import { isActive, NAV, SETTINGS_NAV, type NavItem } from "./nav";


export function Sidebar({ insightCount, mode, demo = false }: { insightCount: number | null; mode: "mock" | "live"; demo?: boolean }) {
  const pathname = usePathname();
  const [pref, setPref] = usePersistentState("sidebar-expanded", "0", ["0", "1"] as const);
  const expanded = pref === "1";
  const toggle = () => setPref(expanded ? "0" : "1");

  const item = (n: NavItem, badge?: number | null) => {
    const active = isActive(pathname, n.href);
    const Icon = n.icon;
    return (
      <Link
        key={n.href}
        href={n.href}
        title={expanded ? undefined : n.label}
        className={cn(
          "relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[0.8125rem] transition-colors",
          active ? "bg-card-2 text-fg" : "text-fg-3 hover:bg-card hover:text-fg-2",
        )}
      >
        <Icon size={21} strokeWidth={1.8} className="shrink-0" />
        {expanded && <span className="truncate">{n.label}</span>}
        {badge ? (
          expanded ? (
            <span className="ml-auto rounded-full bg-warn/18 px-1.5 text-[0.6562rem] text-warn">{badge}</span>
          ) : (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-warn" />
          )
        ) : null}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line px-2 py-3 transition-[width] duration-200 md:flex",
        expanded ? "w-[13.75rem]" : "w-[3.5rem]",
      )}
    >
      <div className="mb-4 flex items-center gap-2.5 px-1.5">
        <div className="h-[1.625rem] w-[1.625rem] shrink-0 rounded-[0.5rem] bg-gradient-to-br from-up to-accent" />
        {expanded && <span className="truncate text-[0.8125rem] font-medium tracking-tight">Portfolio</span>}
      </div>
      <nav className="flex flex-col gap-1">{NAV.map((n) => item(n, n.href === "/insights" ? insightCount : null))}</nav>
      <div className="flex-1" />
      <div className="flex flex-col gap-1">
        {item(SETTINGS_NAV)}
        {demo ? (
          <Link
            href="/settings"
            title={expanded ? undefined : "Set up a login to use live data"}
            className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[0.8125rem] text-warn hover:bg-card"
          >
            <KeyRound size={21} strokeWidth={1.8} />
            {expanded && <span>Set up login</span>}
          </Link>
        ) : (
          <form action={logoutAction}>
            <button
              type="submit"
              title={expanded ? undefined : "Sign out"}
              className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[0.8125rem] text-fg-3 hover:bg-card hover:text-fg-2"
            >
              <LogOut size={21} strokeWidth={1.8} />
              {expanded && <span>Sign out</span>}
            </button>
          </form>
        )}
        <button
          onClick={toggle}
          className="flex h-9 items-center gap-3 rounded-lg px-2.5 text-[0.8125rem] text-fg-3 hover:bg-card hover:text-fg-2"
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <PanelLeftClose size={21} strokeWidth={1.8} /> : <PanelLeftOpen size={21} strokeWidth={1.8} />}
          {expanded && <span>Collapse</span>}
        </button>
        <div className={cn("mt-2 flex flex-col gap-1.5 px-2.5 text-[0.6875rem] text-fg-3", !expanded && "items-center px-0")}>
          <div className="flex items-center gap-2" title={mode === "mock" ? "Sample data: Schwab not connected" : "Live Schwab data"}>
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", mode === "mock" ? "bg-warn" : "bg-up")} />
            {expanded && <span>{mode === "mock" ? "Sample data" : "Schwab connected"}</span>}
          </div>
          {expanded && <MarketStatus />}
        </div>
      </div>
    </aside>
  );
}

/** Static placeholder used while the live sidebar streams in. */
export function SidebarShell() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[3.5rem] shrink-0 flex-col border-r border-line px-2 py-3 md:flex">
      <div className="mb-4 px-1.5">
        <div className="h-[1.625rem] w-[1.625rem] rounded-[0.5rem] bg-gradient-to-br from-up to-accent" />
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map((n) => (
          <span key={n.href} className="flex h-9 items-center px-2.5 text-fg-3">
            <n.icon size={21} strokeWidth={1.8} />
          </span>
        ))}
      </nav>
    </aside>
  );
}
