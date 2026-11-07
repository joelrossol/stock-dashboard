import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { pct, toneOf, type Tone } from "@/lib/format";
import type { Severity } from "@/lib/analytics/signals";

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-line bg-card p-3", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, right, className }: { title: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-2", className)}>
      <h3 className="text-[0.75rem] font-medium text-fg-2">{title}</h3>
      {right != null && <div className="text-[0.6875rem] text-fg-3">{right}</div>}
    </div>
  );
}

export type ChipTone = "up" | "down" | "warn" | "neutral" | "accent";

const CHIP: Record<ChipTone, string> = {
  up: "bg-up/14 text-up",
  down: "bg-down/15 text-down",
  warn: "bg-warn/14 text-warn",
  neutral: "bg-white/6 text-fg-2",
  accent: "bg-accent/18 text-[#b9a8ec]",
};

export function Chip({ tone = "neutral", className, children }: { tone?: ChipTone; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-[0.3125rem] px-1.5 py-0.5 text-[0.6562rem] leading-tight", CHIP[tone], className)}>{children}</span>;
}

export const SEVERITY_TONE: Record<Severity, ChipTone> = {
  warning: "down",
  caution: "warn",
  opportunity: "up",
  info: "accent",
};

export const TONE_TEXT: Record<Tone, string> = { up: "text-up", down: "text-down", flat: "text-fg-2" };

export function toneClass(v: number) {
  return TONE_TEXT[toneOf(v)];
}

export function Delta({ value, digits = 2, className }: { value: number | null | undefined; digits?: number; className?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className={cn("text-fg-3", className)}>—</span>;
  return <span className={cn(toneClass(value), className)}>{pct(value, { digits })}</span>;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[0.6875rem] text-fg-3", className)}>{children}</p>;
}

export function Stat({ label, value, sub, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; className?: string }) {
  return (
    <Card className={cn("px-2.5 py-2", className)}>
      <Label className="truncate">{label}</Label>
      <p className={cn("mt-0.5 truncate text-[0.9375rem] font-medium leading-tight", tone ? TONE_TEXT[tone] : "text-fg")}>{value}</p>
      {sub != null && <p className="mt-0.5 truncate text-[0.6562rem] text-fg-3">{sub}</p>}
    </Card>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-[1.125rem] font-medium tracking-tight">{title}</h1>
        {sub && <p className="text-[0.75rem] text-fg-3">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl border border-line bg-card", className)} />;
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
      <p className="text-[0.8125rem] text-fg-2">{title}</p>
      {body && <p className="max-w-sm text-[0.75rem] text-fg-3">{body}</p>}
    </div>
  );
}

export function GradeBadge({ grade, className }: { grade: string; className?: string }) {
  const tone = grade === "A" || grade === "B" ? "bg-up/16 text-up" : grade === "C" ? "bg-white/8 text-fg-2" : "bg-down/16 text-down";
  return <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-md text-[0.6875rem] font-medium", tone, className)}>{grade}</span>;
}
