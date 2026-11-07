"use client";

import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Sparkline } from "@/components/charts/Sparkline";
import { Chip, Delta, SEVERITY_TONE, toneClass } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { money, price, shares } from "@/lib/format";
import type { HoldingRow } from "@/lib/model";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic, alphanumeric: sortFn_alphanumeric },
});
const helper = createColumnHelper<typeof features, HoldingRow>();

const num = "text-right";

const columns = helper.columns([
  helper.accessor("symbol", {
    header: "Symbol",
    sortFn: "alphanumeric",
    cell: (c) => {
      const r = c.row.original;
      return (
        <Link href={`/symbol/${r.symbol}`} className="block min-w-0 hover:underline" onClick={(e) => e.stopPropagation()}>
          <div className="font-medium">{r.symbol}</div>
          <div className="truncate text-[0.6562rem] text-fg-3">{r.name}</div>
        </Link>
      );
    },
  }),
  helper.display({
    id: "spark",
    header: "30 days",
    cell: (c) => (
      <div className="flex justify-center">
        <Sparkline values={c.row.original.spark} />
      </div>
    ),
  }),
  helper.accessor("dayPL", {
    header: "Day",
    sortFn: "basic",
    meta: { cls: num },
    cell: (c) => (
      <div>
        <div className={toneClass(c.getValue())}>{money(c.getValue(), { sign: true })}</div>
        <div className="text-[0.6562rem]">
          <Delta value={c.row.original.dayPct} digits={2} />
        </div>
      </div>
    ),
  }),
  helper.accessor("quantity", { header: "Shares", sortFn: "basic", meta: { cls: num }, cell: (c) => shares(c.getValue()) }),
  helper.accessor("marketValue", { header: "Value", sortFn: "basic", meta: { cls: num }, cell: (c) => money(c.getValue()) }),
  helper.accessor("gain", {
    header: "Gain",
    sortFn: "basic",
    meta: { cls: num },
    cell: (c) => (
      <div>
        <div className={toneClass(c.getValue())}>{money(c.getValue(), { sign: true })}</div>
        <div className="text-[0.6562rem]">
          <Delta value={c.row.original.gainPct} digits={1} />
        </div>
      </div>
    ),
  }),
  helper.accessor("w1", { header: "1W", sortFn: "basic", meta: { cls: num }, cell: (c) => <Delta value={c.getValue()} digits={1} /> }),
  helper.accessor("m1", { header: "1M", sortFn: "basic", meta: { cls: num }, cell: (c) => <Delta value={c.getValue()} digits={1} /> }),
  helper.accessor("ytd", { header: "YTD", sortFn: "basic", meta: { cls: num }, cell: (c) => <Delta value={c.getValue()} digits={1} /> }),
  helper.accessor("trendScore", {
    header: "Signal",
    sortFn: "basic",
    meta: { cls: "text-right" },
    cell: (c) => {
      const r = c.row.original;
      return (
        <div className="flex justify-end">
          {r.tags[0] ? <Chip tone={SEVERITY_TONE[r.tags[0].severity]}>{r.tags[0].tag}</Chip> : <Chip>{r.trendLabel}</Chip>}
        </div>
      );
    },
  }),
]);

const WIDTHS = ["18%", "9%", "9%", "7%", "10%", "10%", "7%", "7%", "7%", "11%"];

export function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  const data = useMemo(() => rows, [rows]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const table = useTable({ features, columns, data, initialState: { sorting: [{ id: "marketValue", desc: true }] } });

  return (
    <div className="-mx-3 overflow-x-auto px-3">
      <table className="w-full min-w-[50rem] table-fixed text-[0.75rem]">
        <colgroup>
          <col style={{ width: 28 }} />
          {WIDTHS.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((g) => (
            <tr key={g.id} className="text-[0.6562rem] text-fg-3">
              <th />
              {g.headers.map((h) => {
                const sorted = h.column.getIsSorted();
                const canSort = h.column.getCanSort();
                const cls = (h.column.columnDef.meta as { cls?: string } | undefined)?.cls ?? "text-left";
                return (
                  <th key={h.id} className={cn("py-1.5 font-normal", cls, h.id === "spark" && "text-center")}>
                    {canSort ? (
                      <button onClick={h.column.getToggleSortingHandler()} className={cn("inline-flex items-center gap-0.5 hover:text-fg-2", sorted && "text-fg")}>
                        <table.FlexRender header={h} />
                        {sorted === "asc" ? <ArrowUp size={14} /> : sorted === "desc" ? <ArrowDown size={14} /> : null}
                      </button>
                    ) : (
                      <table.FlexRender header={h} />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const r = row.original;
            const isOpen = !!open[r.symbol];
            const multi = r.accounts.length > 1;
            return (
              <Fragment key={row.id}>
                <tr
                  className={cn("border-t border-line", multi && "cursor-pointer hover:bg-white/[0.02]")}
                  onClick={() => multi && setOpen((o) => ({ ...o, [r.symbol]: !o[r.symbol] }))}
                >
                  <td className="text-fg-3">{multi ? isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} /> : null}</td>
                  {row.getAllCells().map((cell) => {
                    const cls = (cell.column.columnDef.meta as { cls?: string } | undefined)?.cls;
                    return (
                      <td key={cell.id} className={cn("py-1.5", cls)}>
                        <table.FlexRender cell={cell} />
                      </td>
                    );
                  })}
                </tr>
                {multi && isOpen && (
                  <tr>
                    <td />
                    <td colSpan={WIDTHS.length} className="pb-2">
                      <div className="flex flex-wrap gap-1.5">
                        {r.accounts.map((a) => (
                          <div key={a.accountId} className="flex items-center gap-2 rounded-lg border border-line bg-bg/60 px-2 py-1 text-[0.6875rem]">
                            <span className="h-2 w-2 rounded-[3px]" style={{ background: a.color }} />
                            <span className="text-fg-2">{a.name}</span>
                            <span className="text-fg-3">
                              {shares(a.quantity)} sh @ {price(a.avgCost)}
                            </span>
                            <span>{money(a.marketValue)}</span>
                            <Delta value={a.gainPct} digits={1} />
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
