const MINUS = "−";

export type Tone = "up" | "down" | "flat";

export function toneOf(v: number, epsilon = 1e-9): Tone {
  if (v > epsilon) return "up";
  if (v < -epsilon) return "down";
  return "flat";
}

interface MoneyOpts {
  cents?: boolean;
  sign?: boolean;
  compact?: boolean;
}

/** $1,234 · −$1,234.56 · +$3.4k */
export function money(v: number, { cents = false, sign = false, compact = false }: MoneyOpts = {}): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  let body: string;
  if (compact && abs >= 1000) {
    if (abs >= 1e6) body = `${(abs / 1e6).toFixed(2)}M`;
    else body = `${(abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}k`;
  } else {
    const digits = cents ? 2 : 0;
    body = abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  const isZero = cents ? abs < 0.005 : abs < 0.5;
  const prefix = isZero ? "" : v < 0 ? MINUS : sign ? "+" : "";
  return `${prefix}$${body}`;
}

/** Fraction in, percent string out: 0.0123 → +1.23% */
export function pct(f: number, { digits = 2, sign = true }: { digits?: number; sign?: boolean } = {}): string {
  if (!Number.isFinite(f)) return "—";
  const p = f * 100;
  const isZero = Math.abs(p) < 0.5 * 10 ** -digits;
  const prefix = isZero ? "" : p < 0 ? MINUS : sign ? "+" : "";
  return `${prefix}${Math.abs(p).toFixed(digits)}%`;
}

/** Percentage points: 0.043 → +4.3 pts */
export function pts(f: number, digits = 1): string {
  const p = f * 100;
  const prefix = Math.abs(p) < 0.5 * 10 ** -digits ? "" : p < 0 ? MINUS : "+";
  return `${prefix}${Math.abs(p).toFixed(digits)} pts`;
}

export function price(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function num(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "—";
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return v < 0 ? `${MINUS}${s}` : s;
}

export function shares(q: number): string {
  return Number.isInteger(q) ? q.toLocaleString("en-US") : q.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function compactNumber(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return v.toFixed(0);
}

export function signed(v: number, digits = 2): string {
  const s = Math.abs(v).toFixed(digits);
  if (Math.abs(v) < 0.5 * 10 ** -digits) return s;
  return v < 0 ? `${MINUS}${s}` : `+${s}`;
}
