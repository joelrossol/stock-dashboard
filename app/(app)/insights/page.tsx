import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InsightsView } from "@/components/insights/InsightsView";
import { PageHeader, Skeleton } from "@/components/ui/primitives";
import { getPageContext } from "@/lib/context";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[37.5rem]" />}>
      <Insights />
    </Suspense>
  );
}

async function Insights() {
  const { model, suppression } = await getPageContext();
  return (
    <div>
      <PageHeader
        title="Insights"
        sub={
          <>
            Rule-based signals with the numbers behind them. They&apos;re mechanical signals, not investment advice.{" "}
            <Link href="/settings" className="text-fg-2 underline-offset-2 hover:underline">
              Tune thresholds
            </Link>
          </>
        }
      />
      <InsightsView groups={model.groups} suppressed={model.suppressed} mutes={[...suppression.mutes]} />
    </div>
  );
}
