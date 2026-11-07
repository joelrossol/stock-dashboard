import Link from "next/link";
import { Chip } from "@/components/ui/primitives";
import type { Connection } from "@/lib/data/types";

const DAY = 86_400_000;

export function expiresLabel(left: number) {
  if (left <= 0) return "expired";
  const d = Math.floor(left / DAY);
  const h = Math.floor((left % DAY) / 3_600_000);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

/** Top-bar status: sample-data badge, or a reconnect warning when Schwab is about to expire. */
export function ConnectionChip({ mode, connection, asOfLabel, expiresInMs }: { mode: "mock" | "live"; connection: Connection; asOfLabel: string; expiresInMs: number | null }) {
  if (mode === "live" && expiresInMs != null) {
    if (expiresInMs >= 2 * DAY) return null;
    return (
      <Link href="/api/auth/schwab/login" prefetch={false} title="Schwab requires signing in again every 7 days">
        <Chip tone="warn">Reconnect Schwab · {expiresLabel(expiresInMs)}</Chip>
      </Link>
    );
  }
  if (connection.notice === "expired") {
    return (
      <Link href="/settings">
        <Chip tone="down">Schwab login expired · reconnect</Chip>
      </Link>
    );
  }
  if (connection.notice === "error") {
    return (
      <Link href="/settings" title={connection.error}>
        <Chip tone="down">Schwab error · showing sample data</Chip>
      </Link>
    );
  }
  return (
    <Link href="/settings" className="hidden sm:inline" title={`Sample data as of ${asOfLabel}`}>
      <Chip tone="warn">{connection.notice === "not-connected" ? "Sample data · connect Schwab" : "Sample data"}</Chip>
    </Link>
  );
}
