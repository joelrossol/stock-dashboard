import { describe, expect, it } from "vitest";
import { consecutiveDown, drawdown, lastSma, logTrend, moveZ, pctReturn, recentCross, rsi, sma, volumeRatio } from "@/lib/analytics/indicators";

describe("indicators", () => {
  it("simple moving average aligns to the input", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    expect(lastSma([1, 2, 3, 4, 5], 2)).toBe(4.5);
  });

  it("RSI is 100 for a straight climb and ~50 for an even zigzag", () => {
    expect(rsi(Array.from({ length: 30 }, (_, i) => 100 + i))).toBe(100);
    const zig = Array.from({ length: 60 }, (_, i) => (i % 2 ? 101 : 100));
    expect(rsi(zig)!).toBeGreaterThan(45);
    expect(rsi(zig)!).toBeLessThan(55);
  });

  it("log trend recovers a constant growth rate with perfect consistency", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 * 1.01 ** i);
    const t = logTrend(closes, 60)!;
    expect(t.slopePerDay).toBeCloseTo(Math.log(1.01), 10);
    expect(t.r2).toBeCloseTo(1, 10);
  });

  it("returns, streaks, and drawdowns", () => {
    expect(pctReturn([100, 110, 121], 2)).toBeCloseTo(0.21);
    expect(consecutiveDown([5, 6, 5, 4, 3])).toBe(3);
    const dd = drawdown([100, 120, 90, 110]);
    expect(dd.maxDrawdown).toBeCloseTo(-0.25);
    expect(dd.current).toBeCloseTo(110 / 120 - 1);
  });

  it("move z-score and volume ratio", () => {
    const calm = Array.from({ length: 70 }, (_, i) => 100 + (i % 2 ? 0.5 : -0.5));
    const z = moveZ([...calm, calm[calm.length - 1] * 0.95])!;
    expect(z).toBeLessThan(-4);
    expect(volumeRatio([...Array(20).fill(100), 250])).toBe(2.5);
  });

  it("detects a recent golden cross", () => {
    const closes = [...Array.from({ length: 220 }, (_, i) => 200 - i * 0.4), ...Array.from({ length: 60 }, (_, i) => 112 + i * 3)];
    expect(recentCross(closes, 50, 200, 60)?.kind).toBe("golden");
  });
});
