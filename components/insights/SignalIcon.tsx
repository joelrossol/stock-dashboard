import {
  Activity,
  ArrowDownFromLine,
  ArrowUpDown,
  BadgePercent,
  CalendarClock,
  ChartPie,
  CircleDollarSign,
  Coins,
  Crosshair,
  Expand,
  Flame,
  Gauge,
  Hourglass,
  Network,
  Scale,
  Scissors,
  ShieldAlert,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Undo2,
  UserCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { Signal, SignalType } from "@/lib/analytics/signals";

const ICONS: Record<SignalType, LucideIcon> = {
  "losing-streak": TrendingDown,
  downtrend: TrendingDown,
  "death-cross": Activity,
  "below-200": Activity,
  underwater: Undo2,
  laggard: Hourglass,
  "abnormal-drop": Zap,
  "earnings-soon": CalendarClock,
  downgrade: ThumbsDown,
  "concentration-stock": ChartPie,
  "concentration-sector": ChartPie,
  "buy-more": TrendingUp,
  overheated: Flame,
  "dip-in-uptrend": Crosshair,
  "golden-cross": Sparkles,
  breakout: Zap,
  "watchlist-target": Crosshair,
  "idle-cash": CircleDollarSign,
  "wash-sale": ShieldAlert,
  "lt-soon": BadgePercent,
  harvest: Scissors,
  "market-regime": Gauge,
  "trailing-stop": ArrowDownFromLine,
  "risk-share": Scale,
  cluster: Network,
  gap: ArrowUpDown,
  upgrade: ThumbsUp,
  extended: Expand,
  "insider-buying": UserCheck,
  "ex-dividend": Coins,
};

const TONE: Record<Signal["severity"], string> = {
  warning: "bg-down/15 text-down",
  caution: "bg-warn/14 text-warn",
  opportunity: "bg-up/14 text-up",
  info: "bg-accent/18 text-[#b9a8ec]",
};

export function SignalIcon({ signal, size = 28 }: { signal: Pick<Signal, "type" | "severity">; size?: number }) {
  const Icon = ICONS[signal.type];
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-[0.375rem]", TONE[signal.severity])} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.6)} strokeWidth={2} />
    </span>
  );
}
