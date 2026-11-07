import { describe, expect, it } from "vitest";
import { gainBetween, shadowSeries, twrBetween, twrIndex, xirr } from "@/lib/analytics/returns";
import type { DailyPoint } from "@/lib/analytics/reconstruct";

const pt = (date: string, value: number, flow = 0): DailyPoint => ({ date, value, flow, cash: 0, holdings: {} });

describe("returns", () => {
  it("time-weighted return ignores deposits", () => {
    // +10%, then a $50 deposit with no market move.
    const pts = [pt("2026-01-02", 100), pt("2026-01-05", 110), pt("2026-01-06", 160, 50)];
    const idx = twrIndex(pts);
    expect(twrBetween(idx, 0, 2)).toBeCloseTo(0.1, 10);
    expect(gainBetween(pts, 0, 2)).toBeCloseTo(10, 10);
  });

  it("XIRR of 10% over one year", () => {
    const r = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ])!;
    expect(r).toBeCloseTo(0.1, 4);
  });

  it("shadow benchmark buys the benchmark with each deposit", () => {
    const pts = [pt("d1", 1000), pt("d2", 1500, 500), pt("d3", 1500)];
    const px: Record<string, number> = { d1: 100, d2: 100, d3: 110 };
    const s = shadowSeries(pts, 0, "SPY", (_s, d) => px[d]);
    expect(s[2]).toBeCloseTo(15 * 110, 6);
  });
});
