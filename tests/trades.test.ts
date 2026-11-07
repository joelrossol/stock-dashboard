import { describe, expect, it } from "vitest";
import { fifoMatch, gradeOf, washSales } from "@/lib/analytics/trades";
import type { Account, Transaction } from "@/lib/data/types";

let id = 0;
const tx = (accountId: string, date: string, kind: "BUY" | "SELL", symbol: string, qty: number, price: number): Transaction => ({
  id: String(++id),
  accountId,
  date,
  time: `${date}T15:00:00Z`,
  kind,
  symbol,
  quantity: kind === "BUY" ? qty : -qty,
  price,
  netAmount: kind === "BUY" ? -qty * price : qty * price,
  fees: 0,
  description: "",
});

const acct = (id: string, taxTreatment: Account["taxTreatment"]): Account => ({ id, accountNumber: id, mask: id, name: id, taxTreatment, color: "", cash: 0, liquidationValue: 0, longMarketValue: 0, buyingPower: 0 });

describe("trades", () => {
  it("matches sells to the oldest lots first", () => {
    const { matches, open } = fifoMatch([
      tx("a", "2025-01-02", "BUY", "X", 10, 100),
      tx("a", "2025-03-03", "BUY", "X", 10, 120),
      tx("a", "2026-02-02", "SELL", "X", 15, 130),
    ]);
    expect(matches.map((m) => [m.qty, m.buyPrice])).toEqual([
      [10, 100],
      [5, 120],
    ]);
    expect(matches.reduce((s, m) => s + m.pnl, 0)).toBeCloseTo(350);
    expect(matches[0].term).toBe("long");
    expect(matches[1].term).toBe("short");
    expect(open).toHaveLength(1);
    expect(open[0].qty).toBe(5);
  });

  it("flags a wash sale when another account buys within 30 days", () => {
    const txns = [tx("tax", "2026-01-02", "BUY", "Y", 10, 50), tx("tax", "2026-06-01", "SELL", "Y", 10, 40), tx("ira", "2026-06-15", "BUY", "Y", 5, 41)];
    const { matches } = fifoMatch(txns);
    const ws = washSales(txns, matches, [acct("tax", "taxable"), acct("ira", "tax-deferred")]);
    expect(ws).toHaveLength(1);
    expect(ws[0].loss).toBeCloseTo(-100);
  });

  it("grades map to bands", () => {
    expect([0.9, 0.7, 0.55, 0.4, 0.1].map(gradeOf)).toEqual(["A", "B", "C", "D", "F"]);
  });
});
