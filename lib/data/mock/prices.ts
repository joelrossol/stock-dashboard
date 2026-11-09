/** Generates daily and intraday bars for the sample universe. */
import { etToEpoch } from "@/lib/dates";
import type { Bar } from "@/lib/data/types";
import { hashString, mulberry32, normal, round2, type Rng } from "./prng";
import { consecutiveDown, pctReturn } from "@/lib/analytics/indicators";
import { betaOf, SPY_PRICE, UNIVERSE, type MockSymbol, type ScenarioInput } from "./universe";

/** Unscripted symbols shouldn't accidentally trip the scripted signals. */
const defaultCheck = ({ closes }: ScenarioInput) => consecutiveDown(closes) < 4 && (pctReturn(closes, 63) ?? 0) > -0.02;

const MAX_ATTEMPTS = 600;

interface Series {
  closes: number[];
  volumes: number[];
  rets: number[];
  dailyVol: number;
}

/**
 * Daily returns = drift + beta × (market move) + idiosyncratic noise, so stocks
 * co-move with the S&P like real ones. `market` is VOO's demeaned daily returns.
 */
/** Daily volatility of a shared industry factor. */
const FACTOR_VOL = 0.24 / Math.sqrt(252);

/** Demeaned in 10-session blocks: the factor adds co-movement without bending anyone's scripted trend. */
function factorSeries(name: string, n: number): number[] {
  const rng = mulberry32(hashString(`factor:${name}`));
  const raw = Array.from({ length: n }, () => FACTOR_VOL * normal(rng));
  for (let end = n; end > 0; end -= 10) {
    const start = Math.max(0, end - 10);
    const avg = raw.slice(start, end).reduce((x, y) => x + y, 0) / (end - start);
    for (let i = start; i < end; i++) raw[i] -= avg;
  }
  return raw;
}

function buildSeries(def: MockSymbol, n: number, rng: Rng, market: number[] | null, factor: number[] | null = null): Series {
  const rets = new Array<number>(n).fill(0);
  const b = market ? betaOf(def) : 0;
  const mVol = market ? 0.15 / Math.sqrt(252) : 0;

  let idx = n - 1;
  for (const [days, mu, vol] of def.segs) {
    const total = vol / Math.sqrt(252);
    // The factor never takes more than ~60% of a segment's variance, so quiet stretches stay quiet.
    const load = factor ? Math.min(1, (0.75 * total) / FACTOR_VOL) : 0;
    const fVol = load * FACTOR_VOL;
    const idio = Math.sqrt(Math.max(total * total - b * b * mVol * mVol - fVol * fVol, (0.3 * total) ** 2));
    for (let k = 0; k < days && idx > 0; k++, idx--) {
      rets[idx] = mu / 252 + b * (market ? market[idx] : 0) + load * (factor ? factor[idx] : 0) + idio * normal(rng);
    }
  }
  const tail = def.tail ?? [];
  tail.forEach((v, j) => {
    rets[n - 1 - tail.length + j] = v / 100;
  });
  rets[n - 1] = def.todayPct / 100;

  const closes = new Array<number>(n);
  closes[n - 1] = def.price;
  for (let i = n - 1; i > 0; i--) closes[i - 1] = closes[i] / (1 + rets[i]);

  const dailyVol = def.segs[0][2] / Math.sqrt(252);
  const volumes = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const shock = Math.abs(rets[i]) / Math.max(dailyVol, 1e-4);
    volumes[i] = Math.round(def.volume * Math.exp(0.28 * normal(rng)) * (0.85 + 0.12 * Math.min(shock, 4)));
  }
  if (def.volSpike) volumes[n - 1] = Math.round(def.volume * def.volSpike);
  return { closes, volumes, rets, dailyVol };
}

function toBars(sessions: string[], s: Series, rng: Rng): Bar[] {
  return sessions.map((date, i) => {
    const close = s.closes[i];
    const prev = i > 0 ? s.closes[i - 1] : close;
    const open = prev * (1 + 0.25 * s.dailyVol * normal(rng));
    const hi = Math.max(open, close) * (1 + Math.abs(normal(rng)) * 0.45 * s.dailyVol);
    const lo = Math.min(open, close) * (1 - Math.abs(normal(rng)) * 0.45 * s.dailyVol);
    return {
      t: etToEpoch(date, 1, 0), // Schwab stamps daily candles at midnight Central
      date,
      open: round2(open),
      high: round2(hi),
      low: round2(lo),
      close: round2(close),
      volume: s.volumes[i],
    };
  });
}

/** Five-minute bars bridging each session's open to its close. */
function intradayFor(date: string, bar: Bar, dailyVol: number, rng: Rng): Bar[] {
  const m = 78;
  const sd = (dailyVol / Math.sqrt(m)) * 0.9;
  const w = [0];
  for (let j = 1; j <= m; j++) w.push(w[j - 1] + sd * normal(rng));
  const lo = Math.log(bar.open);
  const lc = Math.log(bar.close);
  const path = w.map((x, j) => Math.exp(lo + (j / m) * (lc - lo) + x - (j / m) * w[m]));
  const out: Bar[] = [];
  for (let j = 1; j <= m; j++) {
    const o = path[j - 1];
    const c = path[j];
    const u = 1 + Math.abs(normal(rng)) * sd * 0.35;
    const d = 1 - Math.abs(normal(rng)) * sd * 0.35;
    const shape = 1.6 - Math.sin((Math.PI * (j - 0.5)) / m) * 1.1; // U-shaped volume
    out.push({
      t: etToEpoch(date, 9, 30) + (j - 1) * 300_000,
      date,
      open: round2(o),
      high: round2(Math.max(o, c) * u),
      low: round2(Math.min(o, c) * d),
      close: round2(c),
      volume: Math.round(((bar.volume / m) * shape) / 0.9),
    });
  }
  return out;
}

export interface GeneratedPrices {
  daily: Record<string, Bar[]>;
  intraday: Record<string, Bar[]>;
}

export function generatePrices(sessions: string[]): GeneratedPrices {
  const n = sessions.length;
  const daily: Record<string, Bar[]> = {};
  const intraday: Record<string, Bar[]> = {};
  const vols: Record<string, number> = {};

  const order = [...UNIVERSE].sort((a, b) => (a.symbol === "VOO" ? -1 : b.symbol === "VOO" ? 1 : 0));
  let spyCloses: number[] = [];
  let market: number[] | null = null;
  const factors = new Map<string, number[]>();
  const factorFor = (name?: string) => (name ? (factors.get(name) ?? factors.set(name, factorSeries(name, n)).get(name)!) : null);

  for (const def of order) {
    const base = hashString(def.symbol);
    let chosen: Series | null = null;
    let chosenRng: Rng | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const rng = mulberry32(base + attempt * 7919);
      const s = buildSeries(def, n, rng, def.symbol === "VOO" ? null : market, factorFor(def.factor));
      if ((def.check ?? defaultCheck)({ closes: s.closes, volumes: s.volumes, spy: spyCloses })) {
        chosen = s;
        chosenRng = rng;
        break;
      }
      if (attempt === MAX_ATTEMPTS - 1) {
        console.warn(`[mock] scenario for ${def.symbol} not satisfied; using last attempt`);
        chosen = s;
        chosenRng = rng;
      }
    }
    const s = chosen!;
    daily[def.symbol] = toBars(sessions, s, chosenRng!);
    vols[def.symbol] = s.dailyVol;
    if (def.symbol === "VOO") {
      const avg = s.rets.reduce((x, y) => x + y, 0) / n;
      market = s.rets.map((r) => r - avg);
      const k = SPY_PRICE / def.price;
      spyCloses = s.closes.map((c) => c * k);
      daily.SPY = daily.VOO.map((b) => ({
        ...b,
        open: round2(b.open * k),
        high: round2(b.high * k),
        low: round2(b.low * k),
        close: round2(b.close * k),
        volume: b.volume * 12,
      }));
      vols.SPY = s.dailyVol;
    }
  }

  // Intraday for the last five sessions; daily OHLC is reconciled to match.
  for (const sym of Object.keys(daily)) {
    if (sym === "SPY") continue;
    const rng = mulberry32(hashString(`${sym}:intraday`));
    const bars = daily[sym];
    const out: Bar[] = [];
    for (let i = n - 5; i < n; i++) {
      const prevClose = bars[i - 1].close;
      const gap = i === n - 1 ? UNIVERSE.find((u) => u.symbol === sym)?.gapPct : undefined;
      const b = { ...bars[i], open: round2(prevClose * (1 + (gap != null ? gap / 100 : 0.15 * vols[sym] * normal(rng)))) };
      const day = intradayFor(sessions[i], b, vols[sym], rng);
      bars[i] = {
        ...bars[i],
        open: b.open,
        high: Math.max(...day.map((x) => x.high)),
        low: Math.min(...day.map((x) => x.low)),
      };
      out.push(...day);
    }
    intraday[sym] = out;
  }
  const k = SPY_PRICE / UNIVERSE.find((u) => u.symbol === "VOO")!.price;
  intraday.SPY = intraday.VOO.map((b) => ({
    ...b,
    open: round2(b.open * k),
    high: round2(b.high * k),
    low: round2(b.low * k),
    close: round2(b.close * k),
    volume: b.volume * 12,
  }));
  daily.SPY = daily.SPY.map((b, i) =>
    i >= n - 5
      ? { ...b, open: round2(daily.VOO[i].open * k), high: round2(daily.VOO[i].high * k), low: round2(daily.VOO[i].low * k) }
      : b,
  );

  return { daily, intraday };
}
