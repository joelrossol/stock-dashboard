import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS } from "@/lib/analytics/thresholds";
import { makeCloseLookup, reconstructAccount } from "@/lib/analytics/reconstruct";
import { loadPortfolioData } from "@/lib/data/load";
import { ACCOUNT_DEFS } from "@/lib/data/mock/ledger";
import { WATCHLIST_SEED } from "@/lib/data/mock/universe";
import { getMockWorld } from "@/lib/data/mock/world";
import type { PortfolioData } from "@/lib/data/types";
import { buildModel, netWorthSeries, type PortfolioModel } from "@/lib/model";

let data: PortfolioData;
let model: PortfolioModel;

beforeAll(async () => {
  data = await loadPortfolioData();
  const wl = [{ id: 1, name: "Main", items: WATCHLIST_SEED.map((w) => ({ symbol: w.symbol, targetPrice: w.target ?? null, note: null, addedAt: "" })) }];
  model = buildModel(data, "all", DEFAULT_THRESHOLDS, { snoozes: new Map(), mutes: new Set() }, wl);
});

const has = (type: string, symbol?: string) => model.signals.some((s) => s.type === type && (symbol == null || s.symbol === symbol));

describe("sample scenarios fire their signals", () => {
  it.each([
    ["losing-streak", "INTC"],
    ["abnormal-drop", "XOM"],
    ["death-cross", "UNH"],
    ["downgrade", "UNH"],
    ["earnings-soon", "NVDA"],
    ["concentration-stock", "NVDA"],
    ["concentration-sector", undefined],
    ["buy-more", "MSFT"],
    ["dip-in-uptrend", "AMD"],
    ["breakout", "AVGO"],
    ["golden-cross", "CRWD"],
    ["laggard", "DIS"],
    ["overheated", "PLTR"],
    ["watchlist-target", "NFLX"],
    ["wash-sale", "INTC"],
    ["lt-soon", "AAPL"],
    ["gap", "META"],
    ["insider-buying", "DIS"],
    ["insider-buying", "ADBE"],
    ["risk-share", "NVDA"],
    ["cluster", undefined],
    ["trailing-stop", "INTC"],
    ["breakout", "LLY"],
  ])("%s %s", (type, symbol) => {
    expect(has(type, symbol)).toBe(true);
  });

  it("never suggests buying more of an over-cap position", () => {
    expect(has("buy-more", "NVDA")).toBe(false);
  });

  it("groups the chip stocks, and only them", () => {
    const c = model.signals.find((s) => s.type === "cluster")!;
    expect(c.title).toContain("NVDA");
    expect(c.title).toContain("AVGO");
    expect(c.title).not.toContain("AAPL");
  });

  it("skips price-trend rules for broad index funds", () => {
    const trend = ["losing-streak", "downtrend", "death-cross", "below-200", "laggard", "abnormal-drop", "buy-more", "dip-in-uptrend", "breakout", "golden-cross", "extended", "gap"];
    expect(model.signals.some((s) => ["VOO", "QQQ", "SCHD"].includes(s.symbol ?? "") && trend.includes(s.type))).toBe(false);
  });
});

describe("sample ledger", () => {
  it("normalized positions match the ledger", () => {
    const w = getMockWorld(data.asOf);
    for (const st of w.ledger.accounts) {
      const acct = data.accounts.find((a) => a.accountNumber === st.def.accountNumber)!;
      expect(acct.cash).toBeCloseTo(st.cash, 2);
      expect(acct.cash).toBeCloseTo(st.def.targetCash, 0);
    }
    expect(data.accounts).toHaveLength(ACCOUNT_DEFS.length);
  });

  it("rebuilding history backward reaches zero before the first deposit", () => {
    const a = data.accounts[0];
    const holdings: Record<string, number> = {};
    for (const p of data.positions.filter((x) => x.accountId === a.id)) holdings[p.symbol] = p.quantity;
    const txns = data.transactions.filter((t) => t.accountId === a.id);
    const sessions = data.daily.SPY.map((b) => b.date);
    const pts = reconstructAccount({ holdings, cash: a.cash, transactions: txns, sessions, close: makeCloseLookup(data.daily) });
    const first = pts[0];
    // On the first day the account holds exactly what was deposited and bought that day.
    const depositedDay1 = txns.filter((t) => t.date === first.date && t.kind === "DEPOSIT").reduce((s, t) => s + t.netAmount, 0);
    expect(first.value).toBeGreaterThan(0);
    expect(first.value).toBeLessThanOrEqual(depositedDay1 + 1);
    expect(pts.at(-1)!.value).toBeCloseTo(a.liquidationValue, 0);
  });

  it("net-worth ranges end at today's total", () => {
    for (const r of netWorthSeries(model)) {
      expect(r.points.at(-1)!.v).toBeCloseTo(model.total, -1);
    }
  });
});
