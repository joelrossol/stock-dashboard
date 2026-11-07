"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { marketStatus, type MarketStatus as Status } from "@/lib/dates";

export function MarketStatus({ className }: { className?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    const tick = () => setStatus(marketStatus(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  if (!status) return <span className={cn("h-4 w-24", className)} />;
  return (
    <span className={cn("flex items-center gap-1.5 whitespace-nowrap text-[0.6875rem] text-fg-2", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", status.open ? "bg-up" : "bg-fg-3")} />
      {status.label}
    </span>
  );
}
