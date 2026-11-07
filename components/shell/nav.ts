import { ArrowLeftRight, Eye, Layers, LayoutDashboard, Lightbulb, LineChart, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/holdings", label: "Holdings", icon: Layers },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/trades", label: "Trades", icon: ArrowLeftRight },
  { href: "/performance", label: "Performance", icon: LineChart },
  { href: "/insights", label: "Insights", icon: Lightbulb },
];

export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: Settings };

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
