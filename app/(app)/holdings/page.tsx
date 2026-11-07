import type { Metadata } from "next";
import { Suspense } from "react";
import { PieChart } from "@/components/charts/PieChart";
import { HoldingsTable } from "@/components/tables/HoldingsTable";
import { Card, CardHeader, PageHeader, Skeleton, Stat } from "@/components/ui/primitives";
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
  const byType = (t: string) => h.filter((x) => x.assetType === t).reduce((s, x) => s + x.marketValue, 0);
  const accounts = [...model.accountSummaries].sort((a, b) => b.value - a.value);
  const share = model.total > 0 ? model.invested / model.total : 0;
  const multi = h.filter((x) => x.accounts.length > 1).length;

  return (
    <div>
      <PageHeader
        title="Holdings"
        sub={`${h.length} positions · ${money(model.invested)} invested across ${model.accounts.length} account${model.accounts.length > 1 ? "s" : ""}${multi ? ` · ${multi} held in more than one account (click to expand)` : ""}`}
      />
      <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-3">
        <Card>
          <CardHeader title="By sector" right="Funds by category" />
          <PieChart segments={model.sectorWeights.map((s) => ({ label: s.sector, value: s.value }))} center={{ label: "Invested", value: money(model.invested, { compact: true }) }} />
        </Card>
        <Card>
          <CardHeader title="By asset type" />
          <PieChart
            segments={[
              { label: "Stocks", value: byType("EQUITY"), color: "#8E78C4" },
              { label: "ETFs", value: byType("ETF"), color: "#6E9C86" },
              { label: "Mutual funds", value: byType("FUND"), color: "#6B8FC2" },
              { label: "Other", value: byType("OTHER"), color: "#9C8C6E" },
              { label: "Cash", value: model.cash, color: "#5A5870" },
            ]}
            center={{ label: "Total", value: money(model.total, { compact: true }) }}
          />
        </Card>
        <Card>
          <CardHeader title="By account" />
          <PieChart segments={accounts.map((a) => ({ label: a.account.name, value: a.value, color: a.account.color }))} center={{ label: "Accounts", value: String(accounts.length) }} />
        </Card>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Largest position" value={pct(conc.top1 * share, { digits: 1, sign: false })} sub={h[0]?.symbol ?? "—"} />
        <Stat label="Top 5" value={pct(conc.top5 * share, { digits: 0, sign: false })} sub="of portfolio" />
        <Stat label="Top 10" value={pct(conc.top10 * share, { digits: 0, sign: false })} sub="of portfolio" />
        <Stat label="Effective holdings" value={conc.effectiveN.toFixed(1)} sub={`of ${h.length} positions`} />
      </div>
      <Card className="pb-1">
        <HoldingsTable rows={h} />
      </Card>
    </div>
  );
}
