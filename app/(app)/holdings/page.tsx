import type { Metadata } from "next";
import { Suspense } from "react";
import { AllocationBar } from "@/components/charts/AllocationBar";
import { HoldingsTable } from "@/components/tables/HoldingsTable";
import { Card, CardHeader, Label, PageHeader, Skeleton } from "@/components/ui/primitives";
import { concentration } from "@/lib/analytics/risk";
import { getPageContext } from "@/lib/context";
import { money, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Holdings" };

export default function HoldingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[37.5rem]" />}>
      <Holdings />
    </Suspense>
  );
}

async function Holdings() {
  const { model } = await getPageContext();
  const h = model.holdings;
  const conc = concentration(h.map((x) => x.marketValue));
  const etf = h.filter((x) => x.assetType === "ETF").reduce((s, x) => s + x.marketValue, 0);
  const stocks = model.invested - etf;
  const multi = h.filter((x) => x.accounts.length > 1).length;

  return (
    <div>
      <PageHeader
        title="Holdings"
        sub={`${h.length} positions · ${money(model.invested)} invested across ${model.accounts.length} account${model.accounts.length > 1 ? "s" : ""}${multi ? ` · ${multi} held in more than one account (click to expand)` : ""}`}
      />
      <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader title="By sector" />
          <AllocationBar segments={model.sectorWeights.map((s) => ({ label: s.sector, value: s.value }))} />
        </Card>
        <Card>
          <CardHeader title="By asset type" />
          <AllocationBar
            segments={[
              { label: "Stocks", value: stocks, color: "#8E78C4" },
              { label: "ETFs", value: etf, color: "#6E9C86" },
              { label: "Cash", value: model.cash, color: "#5A5870" },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="By account" />
          <AllocationBar segments={model.accountSummaries.map((a) => ({ label: a.account.name, value: a.value, color: a.account.color }))} />
        </Card>
        <Card>
          <CardHeader title="Concentration" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            <div>
              <Label>Largest position</Label>
              <p className="text-[0.9375rem] font-medium">{pct(conc.top1 * (model.invested / model.total), { digits: 1, sign: false })}</p>
              <p className="text-[0.6562rem] text-fg-3">{h[0]?.symbol}</p>
            </div>
            <div>
              <Label>Top 5</Label>
              <p className="text-[0.9375rem] font-medium">{pct(conc.top5 * (model.invested / model.total), { digits: 0, sign: false })}</p>
              <p className="text-[0.6562rem] text-fg-3">of portfolio</p>
            </div>
            <div>
              <Label>Effective holdings</Label>
              <p className="text-[0.9375rem] font-medium">{conc.effectiveN.toFixed(1)}</p>
              <p className="text-[0.6562rem] text-fg-3">of {h.length} positions</p>
            </div>
            <div>
              <Label>Top 10</Label>
              <p className="text-[0.9375rem] font-medium">{pct(conc.top10 * (model.invested / model.total), { digits: 0, sign: false })}</p>
              <p className="text-[0.6562rem] text-fg-3">of portfolio</p>
            </div>
          </div>
        </Card>
      </div>
      <Card className="pb-1">
        <HoldingsTable rows={h} />
      </Card>
    </div>
  );
}
