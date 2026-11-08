"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { loadSymbolBarsAction, saveTradeNoteAction } from "@/app/actions";
import { PriceChart, type PriceBar, type TradeMarker } from "@/components/charts/PriceChart";
import { Card, Chip, Delta, GradeBadge, toneClass } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/dates";
import { money, pct, pts, price, shares } from "@/lib/format";

export interface TradeRow {
  id: string;
  side: "BUY" | "SELL";
  symbol: string;
  name: string;
  date: string;
  accountId: string;
  accountName: string;
  accountColor: string;
  qty: number;
  price: number;
  amount: number;
  current: number;
  sinceTrade: number;
  benchSince: number;
  timingPct: number;
  grade: string;
  score: number;
  verdict: string;
  verdictTone: "up" | "down" | "flat";
  horizons: { label: string; available: boolean; stockRet: number; benchRet: number; excess: number; grade: string }[];
  proceeds?: number;
  valueIfHeld?: number;
  missedDividends?: number;
  heldDiff?: number;
  maxAfter?: number;
  realizedPnl?: number;
  realizedPct?: number;
  holdingDays?: number;
  alpha?: number;
  mae?: number;
  stillHeld?: number;
  lots: { qty: number; buyDate: string; buyPrice: number; pnl: number; term: string }[];
  note: string;
}

const FILTERS = ["All", "Buys", "Sells"] as const;

export function TradesView({ rows, markersBySymbol }: { rows: TradeRow[]; markersBySymbol: Record<string, TradeMarker[]> }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<TradeRow | null>(null);

  const shown = useMemo(
    () =>
      rows.filter((r) => (filter === "All" || (filter === "Buys" ? r.side === "BUY" : r.side === "SELL")) && (!q || r.symbol.includes(q.toUpperCase()) || r.name.toUpperCase().includes(q.toUpperCase()))),
    [rows, filter, q],
  );

  return (
    <Card className="pb-1">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-[0.75rem] font-medium text-fg-2">Trade journal</h3>
        <span className="text-[0.6875rem] text-fg-3">{shown.length} trades · click any row to review it in hindsight</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex h-7 items-center gap-1.5 rounded-lg border border-line bg-bg px-2">
            <Search size={15} className="text-fg-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Symbol" className="w-20 bg-transparent text-[0.75rem] outline-none placeholder:text-fg-3" />
          </div>
          <Segmented options={FILTERS} value={filter} onChange={(v) => setFilter(v as typeof filter)} />
        </div>
      </div>
      <div className="-mx-3 overflow-x-auto px-3">
        <table className="w-full min-w-[56.25rem] table-fixed text-[0.75rem]">
          <thead>
            <tr className="text-[0.6562rem] text-fg-3">
              <th className="w-[9%] py-1.5 text-left font-normal">Date</th>
              <th className="w-[7%] text-left font-normal">Side</th>
              <th className="w-[14%] text-left font-normal">Symbol</th>
              <th className="w-[13%] text-left font-normal">Account</th>
              <th className="text-right font-normal">Shares</th>
              <th className="text-right font-normal">Price</th>
              <th className="text-right font-normal">Amount</th>
              <th className="text-right font-normal">Since</th>
              <th className="w-[24%] pl-4 text-left font-normal">Hindsight</th>
              <th className="w-10 text-right font-normal">Grade</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} onClick={() => setSelected(r)} className="cursor-pointer border-t border-line hover:bg-white/[0.025]">
                <td className="py-2 text-fg-2">{fmtDate(r.date, "short")} <span className="text-fg-3">’{r.date.slice(2, 4)}</span></td>
                <td>
                  <Chip tone={r.side === "BUY" ? "up" : "down"}>{r.side === "BUY" ? "Buy" : "Sell"}</Chip>
                </td>
                <td>
                  <span className="font-medium">{r.symbol}</span>
                  <span className="ml-1.5 truncate text-[0.6562rem] text-fg-3">{r.name.split(" ")[0]}</span>
                </td>
                <td className="truncate">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ background: r.accountColor }} />
                  <span className="text-fg-2">{r.accountName}</span>
                </td>
                <td className="text-right">{shares(r.qty)}</td>
                <td className="text-right">{price(r.price)}</td>
                <td className={cn("text-right", toneClass(r.amount))}>{money(r.amount, { sign: true })}</td>
                <td className="text-right">
                  <Delta value={r.sinceTrade} digits={1} />
                </td>
                <td className={cn("truncate pl-4 text-[0.7188rem]", r.verdictTone === "up" ? "text-up" : r.verdictTone === "down" ? "text-down" : "text-fg-2")}>{r.verdict}</td>
                <td className="text-right">
                  <GradeBadge grade={r.grade} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TradeDrawer trade={selected} markers={selected ? (markersBySymbol[selected.symbol] ?? []) : []} onClose={() => setSelected(null)} />
    </Card>
  );
}

function TradeDrawer({ trade, markers, onClose }: { trade: TradeRow | null; markers: TradeMarker[]; onClose: () => void }) {
  return (
    <Dialog.Root open={!!trade} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content className="fixed bottom-0 right-0 top-0 z-50 flex w-[min(620px,100vw)] flex-col overflow-y-auto border-l border-line-2 bg-bg shadow-2xl">
          {trade && <TradeDetail key={trade.id} t={trade} markers={markers} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TradeDetail({ t, markers }: { t: TradeRow; markers: TradeMarker[] }) {
  const [bars, setBars] = useState<PriceBar[] | null>(null);
  const [note, setNote] = useState(t.note);
  const [saved, setSaved] = useState(false);
  const [, start] = useTransition();

  useEffect(() => {
    let alive = true;
    loadSymbolBarsAction(t.symbol).then((b) => {
      if (alive) setBars(b);
    });
    return () => {
      alive = false;
    };
  }, [t.symbol]);

  return (
    <>
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
            <Chip tone={t.side === "BUY" ? "up" : "down"}>{t.side === "BUY" ? "Bought" : "Sold"}</Chip>
            <Dialog.Title className="text-[0.9375rem] font-medium">
              {shares(t.qty)} {t.symbol} @ {price(t.price)}
            </Dialog.Title>
            <span className="text-[0.75rem] text-fg-3">
              {fmtDate(t.date)} · {t.accountName}
            </span>
            <Dialog.Close className="ml-auto rounded-md p-1 text-fg-3 hover:bg-card hover:text-fg" aria-label="Close">
              <X size={20} />
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-2 p-3">
            <Card className={cn("border", t.verdictTone === "up" ? "border-up/30" : t.verdictTone === "down" ? "border-down/30" : "")}>
              <div className="flex items-center gap-3">
                <GradeBadge grade={t.grade} className="h-9 w-9 text-[1.0625rem]" />
                <div>
                  <p className={cn("text-[0.875rem] font-medium", t.verdictTone === "up" ? "text-up" : t.verdictTone === "down" ? "text-down" : "")}>{t.verdict}</p>
                  <p className="text-[0.7188rem] text-fg-3">
                    {t.symbol} {pct(t.sinceTrade, { digits: 1 })} since this trade vs S&amp;P {pct(t.benchSince, { digits: 1 })}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              {bars ? (
                <PriceChart
                  bars={bars}
                  markers={markers}
                  height={238}
                  compact
                  initialRange={pickRange([t.date, ...t.lots.map((l) => l.buyDate)].sort()[0])}
                  focusDate={t.date}
                  highlight={[{ date: t.date, side: t.side }, ...t.lots.map((l) => ({ date: l.buyDate, side: "BUY" as const }))]}
                />
              ) : (
                <div className="h-[13.75rem] animate-pulse rounded-lg bg-card-2/50" />
              )}
            </Card>

            {t.side === "SELL" ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Mini label="Proceeds" value={money(t.proceeds ?? 0)} />
                <Mini label="If you'd held" value={money(t.valueIfHeld ?? 0)} sub={t.missedDividends ? `incl. ~${money(t.missedDividends)} dividends` : undefined} />
                <Mini label="Difference" value={money(t.heldDiff ?? 0, { sign: true })} tone={(t.heldDiff ?? 0) > 0 ? "down" : "up"} sub={(t.heldDiff ?? 0) > 0 ? "holding was better" : "selling was better"} />
                <Mini label="Realized" value={money(t.realizedPnl ?? 0, { sign: true })} tone={(t.realizedPnl ?? 0) >= 0 ? "up" : "down"} sub={`${pct(t.realizedPct ?? 0, { digits: 1 })} · held ${t.holdingDays}d`} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Mini label="Cost" value={money(-t.amount)} />
                <Mini label="Since buying" value={pct(t.sinceTrade, { digits: 1 })} tone={t.sinceTrade >= 0 ? "up" : "down"} />
                <Mini label="vs S&P" value={pts(t.alpha ?? 0)} tone={(t.alpha ?? 0) >= 0 ? "up" : "down"} />
                <Mini label="Worst drop after" value={pct(t.mae ?? 0, { digits: 1 })} tone="down" sub={t.stillHeld ? `${shares(t.stillHeld)} sh still held` : "fully sold"} />
              </div>
            )}

            <Card>
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="text-[0.75rem] font-medium text-fg-2">Grade by horizon</h3>
                <span className="text-[0.6562rem] text-fg-3">
                  Timing: {t.side === "BUY" ? "bought" : "sold"} at the {Math.round(t.timingPct * 100)}th percentile of its 20-day range
                </span>
              </div>
              <table className="w-full text-[0.75rem]">
                <thead>
                  <tr className="text-[0.6562rem] text-fg-3">
                    <th className="py-1 text-left font-normal">After</th>
                    <th className="text-right font-normal">{t.symbol}</th>
                    <th className="text-right font-normal">S&amp;P</th>
                    <th className="text-right font-normal">{t.side === "BUY" ? "Edge" : "Edge from selling"}</th>
                    <th className="w-10 text-right font-normal">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {t.horizons.map((h) => (
                    <tr key={h.label} className="border-t border-line">
                      <td className="py-1.5 text-fg-2">{h.label}</td>
                      {h.available ? (
                        <>
                          <td className="text-right">
                            <Delta value={h.stockRet} digits={1} />
                          </td>
                          <td className="text-right">
                            <Delta value={h.benchRet} digits={1} />
                          </td>
                          <td className={cn("text-right", toneClass(h.excess))}>{pts(h.excess)}</td>
                          <td className="text-right">
                            <GradeBadge grade={h.grade} />
                          </td>
                        </>
                      ) : (
                        <td colSpan={4} className="text-right text-fg-3">
                          Not enough time yet
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[0.6562rem] leading-relaxed text-fg-3">
                Grades weigh return vs the S&amp;P over each horizon (60%), entry or exit timing within the surrounding 20 sessions (25%), and risk taken or avoided (15%). Fixed horizons keep the grade from being pure hindsight.
              </p>
            </Card>

            {t.lots.length > 0 && (
              <Card>
                <h3 className="mb-1 text-[0.75rem] font-medium text-fg-2">{t.side === "SELL" ? "Lots sold (FIFO)" : "Later sold from this lot"}</h3>
                {t.lots.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 border-t border-line py-1.5 text-[0.75rem]">
                    <span className="text-fg-2">{shares(l.qty)} sh</span>
                    <span className="text-fg-3">
                      bought {fmtDate(l.buyDate, "short")} @ {price(l.buyPrice)}
                    </span>
                    <Chip>{l.term === "long" ? "Long-term" : "Short-term"}</Chip>
                    <span className={cn("ml-auto", toneClass(l.pnl))}>{money(l.pnl, { sign: true })}</span>
                  </div>
                ))}
              </Card>
            )}

            <Card>
              <h3 className="mb-1.5 text-[0.75rem] font-medium text-fg-2">Why I made this trade</h3>
              <textarea
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setSaved(false);
                }}
                rows={3}
                placeholder="Your thesis, so future-you can grade the decision, not just the outcome"
                className="w-full resize-none rounded-lg border border-line bg-bg p-2 text-[0.75rem] outline-none placeholder:text-fg-3 focus:border-line-2"
              />
              <div className="mt-1.5 flex items-center justify-between">
                <Link href={`/symbol/${t.symbol}`} className="text-[0.6875rem] text-fg-3 hover:text-fg-2">
                  Open {t.symbol} →
                </Link>
                <button
                  onClick={() => start(async () => {
                    await saveTradeNoteAction(t.id, note);
                    setSaved(true);
                  })}
                  className="rounded-lg border border-line bg-card px-3 py-1 text-[0.75rem] text-fg-2 hover:border-line-2"
                >
                  {saved ? "Saved" : "Save note"}
                </button>
              </div>
            </Card>
          </div>
    </>
  );
}

function pickRange(date: string): "3M" | "6M" | "1Y" | "3Y" {
  const days = (Date.now() - Date.parse(date)) / 86_400_000;
  if (days < 60) return "3M";
  if (days < 150) return "6M";
  if (days < 330) return "1Y";
  return "3Y";
}

function Mini({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <Card className="px-2.5 py-2">
      <p className="text-[0.6562rem] text-fg-3">{label}</p>
      <p className={cn("text-[0.875rem] font-medium", tone === "up" ? "text-up" : tone === "down" ? "text-down" : "")}>{value}</p>
      {sub && <p className="text-[0.625rem] text-fg-3">{sub}</p>}
    </Card>
  );
}
