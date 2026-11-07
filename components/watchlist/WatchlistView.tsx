"use client";

import { LayoutGrid, Plus, Rows3, Target, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { usePersistentState } from "@/components/ui/usePersistentState";
import { addToWatchlistAction, createWatchlistAction, removeFromWatchlistAction, setWatchTargetAction } from "@/app/actions";
import { Sparkline } from "@/components/charts/Sparkline";
import { Card, Chip, Delta } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/lib/cn";
import { pct, price } from "@/lib/format";

export interface WatchTile {
  symbol: string;
  name: string;
  last: number;
  changePct: number;
  spark: { "1D": number[]; "1M": number[]; "3M": number[] };
  ret: { "1D": number; "1M": number | null; "3M": number | null };
  trendLabel: string;
  trendScore: number;
  rsi: number | null;
  high52: number;
  low52: number;
  earningsIn: number | null;
  target: number | null;
  note: string | null;
  held: boolean;
}

export interface WatchListData {
  id: number;
  name: string;
  tiles: WatchTile[];
}

const SPARK = ["1D", "1M", "3M"] as const;
type SparkKey = (typeof SPARK)[number];

function trendTone(score: number) {
  return score >= 20 ? "up" : score <= -20 ? "down" : "neutral";
}

export function WatchlistView({ lists, universe }: { lists: WatchListData[]; universe: { symbol: string; name: string }[] }) {
  const [listId, setListId] = useState(lists[0]?.id ?? 0);
  const [view, changeView] = usePersistentState("watch-view", "tiles", ["tiles", "table"] as const);
  const [spark, setSpark] = useState<SparkKey>("1M");
  const [adding, setAdding] = useState("");
  const [newList, setNewList] = useState<string | null>(null);
  const [pending, start] = useTransition();


  const list = lists.find((l) => l.id === listId) ?? lists[0];
  const existing = useMemo(() => new Set(list?.tiles.map((t) => t.symbol)), [list]);
  const suggestions = universe.filter((u) => !existing.has(u.symbol));

  const add = () => {
    const s = adding.trim().toUpperCase();
    if (!s || !list) return;
    setAdding("");
    start(() => addToWatchlistAction(list.id, s));
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {lists.map((l) => (
            <button
              key={l.id}
              onClick={() => setListId(l.id)}
              className={cn("rounded-lg px-2.5 py-1 text-[0.75rem]", l.id === list?.id ? "bg-card-2 text-fg" : "text-fg-3 hover:text-fg-2")}
            >
              {l.name} <span className="text-fg-3">{l.tiles.length}</span>
            </button>
          ))}
          {newList == null ? (
            <button onClick={() => setNewList("")} className="rounded-lg p-1.5 text-fg-3 hover:bg-card hover:text-fg-2" title="New list">
              <Plus size={18} />
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = newList;
                setNewList(null);
                if (n.trim()) start(() => createWatchlistAction(n));
              }}
              className="flex items-center gap-1"
            >
              <input autoFocus value={newList} onChange={(e) => setNewList(e.target.value)} placeholder="List name" className="h-7 w-32 rounded-md border border-line bg-card px-2 text-[0.75rem] outline-none focus:border-line-2" />
              <button type="button" onClick={() => setNewList(null)} className="p-1 text-fg-3">
                <X size={16} />
              </button>
            </form>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="ml-auto flex items-center gap-1.5"
        >
          <input
            list="symbols"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            placeholder="Add symbol"
            className="h-8 w-36 rounded-lg border border-line bg-card px-2.5 text-[0.75rem] uppercase outline-none placeholder:normal-case placeholder:text-fg-3 focus:border-line-2"
          />
          <datalist id="symbols">
            {suggestions.map((u) => (
              <option key={u.symbol} value={u.symbol}>
                {u.name}
              </option>
            ))}
          </datalist>
          <button type="submit" disabled={pending} className="flex h-8 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-[0.75rem] text-fg-2 hover:border-line-2">
            <Plus size={16} /> Add
          </button>
        </form>
        <Segmented options={SPARK} value={spark} onChange={(v) => setSpark(v as SparkKey)} />
        <div className="flex rounded-lg border border-line bg-bg p-0.5">
          <button onClick={() => changeView("tiles")} className={cn("rounded-md p-1", view === "tiles" ? "bg-card-2 text-fg" : "text-fg-3")} aria-label="Tile view">
            <LayoutGrid size={18} />
          </button>
          <button onClick={() => changeView("table")} className={cn("rounded-md p-1", view === "table" ? "bg-card-2 text-fg" : "text-fg-3")} aria-label="Table view">
            <Rows3 size={18} />
          </button>
        </div>
      </div>

      {list && list.tiles.length === 0 && (
        <Card className="py-10 text-center text-[0.75rem] text-fg-3">Add a symbol to start this list.</Card>
      )}

      {list && view === "tiles" && (
        <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4", pending && "opacity-70")}>
          {list.tiles.map((t) => (
            <Tile key={t.symbol} t={t} spark={spark} listId={list.id} />
          ))}
        </div>
      )}

      {list && view === "table" && list.tiles.length > 0 && (
        <Card className="pb-1">
          <div className="-mx-3 overflow-x-auto px-3">
            <table className="w-full min-w-[53.75rem] table-fixed text-[0.75rem]">
              <thead>
                <tr className="text-[0.6562rem] text-fg-3">
                  <th className="w-[18%] py-1.5 text-left font-normal">Symbol</th>
                  <th className="w-[12%] text-center font-normal">{spark}</th>
                  <th className="text-right font-normal">Price</th>
                  <th className="text-right font-normal">Day</th>
                  <th className="text-right font-normal">{spark} return</th>
                  <th className="w-[16%] pl-4 text-left font-normal">52-week range</th>
                  <th className="text-right font-normal">Target</th>
                  <th className="text-right font-normal">Trend</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {list.tiles.map((t) => (
                  <tr key={t.symbol} className="border-t border-line">
                    <td className="py-1.5">
                      <Link href={`/symbol/${t.symbol}`} className="hover:underline">
                        <div className="font-medium">{t.symbol}</div>
                        <div className="truncate text-[0.6562rem] text-fg-3">{t.name}</div>
                      </Link>
                    </td>
                    <td>
                      <div className="flex justify-center">
                        <Sparkline values={t.spark[spark]} width={90} height={25} />
                      </div>
                    </td>
                    <td className="text-right">{price(t.last)}</td>
                    <td className="text-right">
                      <Delta value={t.changePct} />
                    </td>
                    <td className="text-right">
                      <Delta value={t.ret[spark]} digits={1} />
                    </td>
                    <td className="pl-4">
                      <RangeBar low={t.low52} high={t.high52} value={t.last} />
                    </td>
                    <td className="text-right">{t.target ? <TargetText t={t} /> : <span className="text-fg-3">—</span>}</td>
                    <td className="text-right">
                      <Chip tone={trendTone(t.trendScore)}>{t.trendLabel}</Chip>
                    </td>
                    <td className="text-right">
                      <button onClick={() => removeFromWatchlistAction(list.id, t.symbol)} className="p-1 text-fg-3 hover:text-down" aria-label={`Remove ${t.symbol}`}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function TargetText({ t }: { t: WatchTile }) {
  if (!t.target) return null;
  const dist = t.last / t.target - 1;
  const hit = t.last <= t.target;
  return (
    <span className={hit ? "text-up" : "text-fg-2"}>
      {price(t.target)}
      <span className="ml-1 text-[0.6562rem] text-fg-3">{hit ? "hit" : pct(dist, { digits: 1 })}</span>
    </span>
  );
}

function RangeBar({ low, high, value }: { low: number; high: number; value: number }) {
  const p = high > low ? Math.min(1, Math.max(0, (value - low) / (high - low))) : 0.5;
  return (
    <div className="flex items-center gap-1.5 text-[0.625rem] text-fg-3">
      <span>{price(low)}</span>
      <div className="relative h-1 flex-1 rounded-full bg-white/8">
        <span className="absolute top-1/2 h-2.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg" style={{ left: `${p * 100}%` }} />
      </div>
      <span>{price(high)}</span>
    </div>
  );
}

function Tile({ t, spark, listId }: { t: WatchTile; spark: SparkKey; listId: number }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(t.target?.toString() ?? "");
  const [, start] = useTransition();
  const r = t.ret[spark];
  return (
    <Card className="group flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/symbol/${t.symbol}`} className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[0.875rem] font-medium">{t.symbol}</span>
            {t.held && <Chip tone="accent">Held</Chip>}
          </div>
          <div className="truncate text-[0.6875rem] text-fg-3">{t.name}</div>
        </Link>
        <div className="text-right">
          <div className="text-[0.875rem] font-medium">{price(t.last)}</div>
          <Delta value={t.changePct} className="text-[0.6875rem]" />
        </div>
      </div>
      <Link href={`/symbol/${t.symbol}`}>
        <Sparkline values={t.spark[spark]} width={375} height={55} strokeWidth={1.6} fluid />
      </Link>
      <div className="flex items-center justify-between text-[0.6875rem]">
        <span className="text-fg-3">
          {spark} <Delta value={r} digits={1} />
        </span>
        <div className="flex items-center gap-1">
          {t.earningsIn != null && t.earningsIn <= 30 && <Chip tone={t.earningsIn <= 7 ? "warn" : "neutral"}>Earnings {t.earningsIn}d</Chip>}
          <Chip tone={trendTone(t.trendScore)}>{t.trendLabel}</Chip>
        </div>
      </div>
      <RangeBar low={t.low52} high={t.high52} value={t.last} />
      <div className="flex items-center justify-between border-t border-line pt-2 text-[0.6875rem]">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setEditing(false);
              const n = val.trim() ? Number(val) : null;
              start(() => setWatchTargetAction(listId, t.symbol, n));
            }}
            className="flex items-center gap-1"
          >
            <Target size={15} className="text-fg-3" />
            <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" placeholder="Target price" className="h-6 w-24 rounded border border-line bg-bg px-1.5 outline-none focus:border-line-2" />
            <button type="submit" className="text-fg-2 hover:text-fg">
              Save
            </button>
          </form>
        ) : (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-fg-3 hover:text-fg-2">
            <Target size={15} />
            {t.target ? <TargetText t={t} /> : "Set target"}
          </button>
        )}
        <button onClick={() => start(() => removeFromWatchlistAction(listId, t.symbol))} className="text-fg-3 opacity-0 transition-opacity hover:text-down group-hover:opacity-100" aria-label={`Remove ${t.symbol}`}>
          <Trash2 size={16} />
        </button>
      </div>
      {t.note && <p className="-mt-1 text-[0.6562rem] text-fg-3">{t.note}</p>}
    </Card>
  );
}
