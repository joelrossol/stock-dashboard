/**
 * Sample brokerage ledger: deposits, trades, and dividends across three
 * accounts. Current positions are *derived* by replaying this ledger, so
 * balances, cost basis, and history are all internally consistent.
 */
import { addDays, etToEpoch, sessionOnOrBefore } from "@/lib/dates";
import type { Bar } from "@/lib/data/types";
import { hashString, mulberry32, round2, type Rng } from "./prng";
import { findMock } from "./universe";

export interface MockAccountDef {
  accountNumber: string;
  hash: string;
  nickname: string;
  schwabType: "MARGIN" | "CASH";
  color: string;
  targetCash: number;
  initialDeposit: { daysAgo: number; amount: number; description: string };
  monthlyContribution?: number;
  holdings: HoldingPlan[];
  extras: ExtraTrade[];
}

type When = number | { cal: number };

interface HoldingPlan {
  symbol: string;
  value: number; // target market value today
  buys: [When, number][]; // when, fraction of final quantity
}

interface ExtraTrade {
  side: "BUY" | "SELL";
  symbol: string;
  qty: number;
  when: When;
}

const monthly = (count: number, everyDays: number, startDaysAgo: number, frac: number): [When, number][] =>
  Array.from({ length: count }, (_, k) => [startDaysAgo - k * everyDays, frac] as [When, number]);

export const ACCOUNT_DEFS: MockAccountDef[] = [
  {
    accountNumber: "74218821",
    hash: "8F3A9C2E61B04D7A95E1C3F28B6D0A47",
    nickname: "Individual brokerage",
    schwabType: "MARGIN",
    color: "Purple",
    targetCash: 9_240,
    initialDeposit: { daysAgo: 505, amount: 42_000, description: "TRANSFER FROM BANK" },
    monthlyContribution: 1_500,
    holdings: [
      { symbol: "NVDA", value: 66_000, buys: [[480, 0.55], [250, 0.25], [90, 0.2]] },
      { symbol: "AAPL", value: 28_000, buys: [[470, 0.5], [{ cal: 356 }, 0.3], [60, 0.2]] },
      { symbol: "MSFT", value: 14_000, buys: [[420, 0.6], [180, 0.4]] },
      { symbol: "AMZN", value: 12_000, buys: [[440, 0.5], [200, 0.5]] },
      { symbol: "GOOGL", value: 12_000, buys: [[460, 1]] },
      { symbol: "META", value: 10_000, buys: [[400, 0.5], [150, 0.5]] },
      { symbol: "TSLA", value: 9_000, buys: [[120, 1]] },
      { symbol: "PLTR", value: 8_000, buys: [[500, 1]] },
      { symbol: "AMD", value: 7_000, buys: [[400, 1]] },
      { symbol: "CRWD", value: 6_000, buys: [[170, 1]] },
      { symbol: "DIS", value: 6_000, buys: [[390, 1]] },
      { symbol: "INTC", value: 5_000, buys: [[300, 1]] },
      { symbol: "VOO", value: 5_000, buys: [[300, 1]] },
    ],
    extras: [
      { side: "BUY", symbol: "NVDA", qty: 150, when: 480 },
      { side: "SELL", symbol: "NVDA", qty: 150, when: 330 }, // trimmed a winner too early
      { side: "BUY", symbol: "NKE", qty: 150, when: 380 },
      { side: "SELL", symbol: "NKE", qty: 150, when: 280 }, // cut a loser before it fell further
      { side: "BUY", symbol: "SHOP", qty: 60, when: 300 },
      { side: "SELL", symbol: "SHOP", qty: 60, when: 205 }, // sold near the bottom
      { side: "BUY", symbol: "TSLA", qty: 40, when: 350 },
      { side: "SELL", symbol: "TSLA", qty: 40, when: 270 },
      { side: "BUY", symbol: "AMD", qty: 10, when: 400 },
      { side: "SELL", symbol: "AMD", qty: 10, when: 100 },
      { side: "BUY", symbol: "INTC", qty: 170, when: 300 },
      { side: "SELL", symbol: "INTC", qty: 170, when: 25 }, // loss sale → wash sale with Roth buy
    ],
  },
  {
    accountNumber: "61937754",
    hash: "2D71E5B9A40C83F6D19B7E2C5A8F0E63",
    nickname: "Rollover IRA",
    schwabType: "CASH",
    color: "Green",
    targetCash: 5_610,
    initialDeposit: { daysAgo: 504, amount: 96_000, description: "ROLLOVER CONTRIBUTION" },
    holdings: [
      { symbol: "VOO", value: 28_000, buys: [[500, 1]] },
      { symbol: "NVDA", value: 26_000, buys: [[470, 1]] },
      { symbol: "QQQ", value: 16_000, buys: [[495, 1]] },
      { symbol: "AVGO", value: 15_000, buys: [[430, 1]] },
      { symbol: "COST", value: 13_000, buys: [[480, 1]] },
      { symbol: "JPM", value: 12_000, buys: [[450, 1]] },
      { symbol: "V", value: 9_000, buys: [[460, 1]] },
      { symbol: "XOM", value: 9_000, buys: [[410, 1]] },
      { symbol: "UNH", value: 8_000, buys: [[350, 1]] },
      { symbol: "AAPL", value: 8_000, buys: [[380, 1]] },
    ],
    extras: [
      { side: "BUY", symbol: "PYPL", qty: 120, when: 420 },
      { side: "SELL", symbol: "PYPL", qty: 120, when: 240 },
      { side: "BUY", symbol: "BA", qty: 40, when: 200 },
      { side: "SELL", symbol: "BA", qty: 40, when: 160 }, // sold right before the recovery
      { side: "BUY", symbol: "COST", qty: 4, when: 480 },
      { side: "SELL", symbol: "COST", qty: 4, when: 60 }, // trimmed a winner
    ],
  },
  {
    accountNumber: "58406213",
    hash: "C6E0F38A1B9247D5E8A3016F4B2D9C71",
    nickname: "Roth IRA",
    schwabType: "CASH",
    color: "Gray",
    targetCash: 9_780,
    initialDeposit: { daysAgo: 505, amount: 24_000, description: "TRANSFER FROM BANK" },
    monthlyContribution: 580,
    holdings: [
      { symbol: "VOO", value: 38_000, buys: [[500, 0.4], ...monthly(18, 21, 380, 0.6 / 18)] },
      { symbol: "MSFT", value: 12_000, buys: [[300, 1]] },
      { symbol: "SCHD", value: 11_000, buys: monthly(6, 63, 440, 1 / 6) },
      { symbol: "GOOGL", value: 10_000, buys: [[360, 1]] },
      { symbol: "KO", value: 7_000, buys: [[480, 0.6], [200, 0.4]] },
      { symbol: "INTC", value: 4_000, buys: [[12, 1]] },
    ],
    extras: [
      { side: "BUY", symbol: "GOOGL", qty: 15, when: 360 },
      { side: "SELL", symbol: "GOOGL", qty: 15, when: 90 },
    ],
  },
];

export type LedgerKind = "BUY" | "SELL" | "DIV" | "DEP" | "WD";

export interface LedgerTxn {
  id: number;
  account: number; // index into ACCOUNT_DEFS
  date: string;
  epoch: number;
  kind: LedgerKind;
  symbol?: string;
  qty?: number;
  price?: number;
  fee?: number;
  amount: number; // signed cash delta
  description: string;
}

export interface Lot {
  qty: number;
  price: number;
  date: string;
}

export interface LedgerAccountState {
  def: MockAccountDef;
  cash: number;
  lots: Record<string, Lot[]>;
}

export interface Ledger {
  accounts: LedgerAccountState[];
  txns: LedgerTxn[];
}

interface PlannedTrade {
  idx: number;
  side: "BUY" | "SELL";
  symbol: string;
  qty: number;
}

const DIV_MONTHS = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec

export function buildLedger(sessions: string[], daily: Record<string, Bar[]>): Ledger {
  const n = sessions.length;
  const asOf = sessions[n - 1];
  const indexOf = new Map(sessions.map((d, i) => [d, i]));
  const at = (w: When): number => {
    if (typeof w === "number") return n - 1 - w;
    const d = sessionOnOrBefore(addDays(asOf, -w.cal));
    return indexOf.get(d) ?? n - 1;
  };

  const txns: LedgerTxn[] = [];
  let nextId = 90_000_001;
  const states: LedgerAccountState[] = [];

  ACCOUNT_DEFS.forEach((def, a) => {
    const rng: Rng = mulberry32(hashString(def.accountNumber));
    const planned: PlannedTrade[] = [];
    for (const h of def.holdings) {
      const finalQty = Math.max(1, Math.round(h.value / daily[h.symbol][n - 1].close));
      let assigned = 0;
      h.buys.forEach(([when, frac], k) => {
        const qty = k === h.buys.length - 1 ? finalQty - assigned : Math.max(1, Math.round(finalQty * frac));
        assigned += qty;
        if (qty > 0) planned.push({ idx: at(when), side: "BUY", symbol: h.symbol, qty });
      });
    }
    for (const x of def.extras) planned.push({ idx: at(x.when), side: x.side, symbol: x.symbol, qty: x.qty });
    planned.sort((p, q) => p.idx - q.idx || (p.side === q.side ? 0 : p.side === "SELL" ? -1 : 1));

    const startIdx = n - 1 - def.initialDeposit.daysAgo;
    const st: LedgerAccountState = { def, cash: 0, lots: {} };
    const held = (sym: string) => (st.lots[sym] ?? []).reduce((s, l) => s + l.qty, 0);
    const push = (t: Omit<LedgerTxn, "id" | "account">) => {
      txns.push({ ...t, id: nextId++, account: a });
      st.cash = round2(st.cash + t.amount);
    };
    const deposit = (i: number, amount: number, description: string) =>
      push({ date: sessions[i], epoch: etToEpoch(sessions[i], 8, 15), kind: "DEP", amount, description });

    let p = 0;
    for (let i = startIdx; i < n; i++) {
      const date = sessions[i];
      if (i === startIdx) deposit(i, def.initialDeposit.amount, def.initialDeposit.description);
      else if (def.monthlyContribution && date.slice(0, 7) !== sessions[i - 1].slice(0, 7)) {
        deposit(i, def.monthlyContribution, "TRANSFER FROM BANK");
      }

      while (p < planned.length && planned[p].idx === i) {
        const t = planned[p++];
        const bar = daily[t.symbol][i];
        const px = round2(bar.low + (bar.high - bar.low) * (0.2 + 0.6 * rng()));
        const epoch = etToEpoch(date, 10, 0) + Math.floor(rng() * 330) * 60_000;
        if (t.side === "BUY") {
          const cost = round2(px * t.qty);
          if (st.cash < cost) deposit(i, Math.ceil((cost - st.cash + 500) / 1000) * 1000, "TRANSFER FROM BANK");
          (st.lots[t.symbol] ??= []).push({ qty: t.qty, price: px, date });
          push({ date, epoch, kind: "BUY", symbol: t.symbol, qty: t.qty, price: px, fee: 0, amount: -cost, description: `Bought ${t.qty} ${t.symbol}` });
        } else {
          const qty = Math.min(t.qty, held(t.symbol));
          if (qty <= 0) continue;
          let left = qty;
          const lots = st.lots[t.symbol];
          while (left > 0 && lots.length) {
            const take = Math.min(left, lots[0].qty);
            lots[0].qty -= take;
            left -= take;
            if (lots[0].qty === 0) lots.shift();
          }
          const gross = round2(px * qty);
          const fee = round2(Math.max(0.01, gross * 0.0000278));
          push({ date, epoch, kind: "SELL", symbol: t.symbol, qty, price: px, fee, amount: round2(gross - fee), description: `Sold ${qty} ${t.symbol}` });
        }
      }

      const [, mm, dd] = date.split("-").map(Number);
      const isExDay = DIV_MONTHS.includes(mm - 1) && dd <= 15 && (i + 1 >= n || Number(sessions[i + 1].split("-")[2]) > 15 || sessions[i + 1].slice(5, 7) !== date.slice(5, 7));
      if (isExDay) {
        for (const sym of Object.keys(st.lots)) {
          const y = findMock(sym)?.divYield;
          const q = held(sym);
          if (!y || q <= 0) continue;
          const amount = round2((q * daily[sym][i].close * y) / 100 / 4);
          if (amount >= 0.01) push({ date, epoch: etToEpoch(date, 7, 0), kind: "DIV", symbol: sym, amount, description: `Qualified dividend (${sym})` });
        }
      }
    }

    // Land the final cash balance on the target with one recent transfer.
    const diff = round2(def.targetCash - st.cash);
    if (Math.abs(diff) >= 1) {
      const i = n - 3;
      const date = sessions[i];
      if (diff > 0) push({ date, epoch: etToEpoch(date, 8, 15), kind: "DEP", amount: diff, description: "TRANSFER FROM BANK" });
      else push({ date, epoch: etToEpoch(date, 8, 15), kind: "WD", amount: diff, description: "TRANSFER TO BANK" });
    }
    states.push(st);
  });

  txns.sort((x, y) => x.epoch - y.epoch || x.id - y.id);
  return { accounts: states, txns };
}
