import { getPageContext } from "@/lib/context";
import { fmtDate } from "@/lib/dates";
import { CommandK, type PaletteSymbol } from "./CommandK";
import { ConnectionChip } from "./ConnectionChip";
import { InsightsBell } from "./InsightsBell";
import { MarketStatus } from "./MarketStatus";
import { ScopeSwitcher, type ScopeOption } from "./ScopeSwitcher";

const TAX_LABEL = { taxable: "Taxable", "tax-deferred": "Tax-deferred", "tax-free": "Tax-free" } as const;

export async function TopBar() {
  const { data, model, watchSymbols, schwabExpiresInMs } = await getPageContext();
  const totalAll = data.accounts.reduce((s, a) => s + a.liquidationValue, 0);
  const options: ScopeOption[] = [
    { id: "all", name: "All accounts", value: totalAll },
    ...data.accounts.map((a) => ({ id: a.id, name: a.name, mask: a.mask, value: a.liquidationValue, color: a.color, tax: TAX_LABEL[a.taxTreatment] })),
  ];
  const held = new Set(data.positions.map((p) => p.symbol));
  const watched = new Set(watchSymbols);
  const symbols: PaletteSymbol[] = data.universe
    .map((s) => ({ symbol: s, name: data.instruments[s]?.name ?? s, changePct: data.quotes[s]?.changePct ?? 0, held: held.has(s), watched: watched.has(s) }))
    .sort((a, b) => Number(b.held) - Number(a.held) || a.symbol.localeCompare(b.symbol));

  return (
    <TopBarFrame>
      <ScopeSwitcher options={options} current={model.scope} />
      <CommandK symbols={symbols} accounts={data.accounts.map((a) => ({ id: a.id, name: a.name }))} />
      <div className="hidden lg:block">
        <MarketStatus />
      </div>
      <ConnectionChip mode={data.mode} connection={data.connection} asOfLabel={fmtDate(data.asOf, "long")} expiresInMs={schwabExpiresInMs} />
      <InsightsBell groups={model.groups} urgent={model.urgentCount} />
    </TopBarFrame>
  );
}

export function TopBarFrame({ children }: { children?: React.ReactNode }) {
  return <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-bg/90 px-3 backdrop-blur md:px-4">{children}</header>;
}
