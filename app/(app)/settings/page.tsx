import type { Metadata } from "next";
import { Suspense } from "react";
import { disconnectSchwabAction, refreshDataAction, resetThresholdsAction, saveAccountsAction, saveThresholdsAction } from "@/app/actions";
import { expiresLabel } from "@/components/shell/ConnectionChip";
import { DataSourceToggle } from "@/components/settings/DataSourceToggle";
import { ConfigCheck } from "@/components/settings/ConfigCheck";
import { headers } from "next/headers";
import { Card, CardHeader, Chip, PageHeader, Skeleton } from "@/components/ui/primitives";
import { DEFAULT_THRESHOLDS, THRESHOLD_FIELDS } from "@/lib/analytics/thresholds";
import { getPageContext } from "@/lib/context";
import { databaseInfo } from "@/lib/db/client";
import { ENV_NAMES, readEnv } from "@/lib/env";
import { fmtDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <Suspense fallback={<Skeleton className="h-[37.5rem]" />}>
      <Settings searchParams={searchParams} />
    </Suspense>
  );
}

const input = "h-8 w-full rounded-lg border border-line bg-bg px-2.5 text-[0.75rem] outline-none focus:border-line-2";
const btn = "rounded-lg border border-line bg-card-2 px-3 py-1.5 text-[0.75rem] text-fg hover:border-line-2";

async function Settings({ searchParams }: { searchParams: PageProps<"/settings">["searchParams"] }) {
  const [{ data, settings, schwabExpiresInMs }, sp, h] = await Promise.all([getPageContext(), searchParams, headers()]);
  const here = `${h.get("x-forwarded-proto") ?? (h.get("host")?.startsWith("127.0.0.1") ? "https" : "http")}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const conn = data.connection;
  const finnhubOn = !!readEnv(ENV_NAMES.finnhub).value;
  const hosted = !!process.env.VERCEL;
  const missingKeys = [!readEnv(ENV_NAMES.schwabKey).value && "SCHWAB_APP_KEY", !readEnv(ENV_NAMES.schwabSecret).value && "SCHWAB_APP_SECRET"].filter(Boolean) as string[];
  const db = databaseInfo();
  const st = conn.status;
  const justConnected = sp.connected === "1";
  const error = typeof sp.schwab_error === "string" ? sp.schwab_error : null;
  const callback = st?.callbackUrl ?? "https://127.0.0.1:3000/api/auth/schwab/callback";
  const callbackOrigin = new URL(callback).origin;
  const wrongOrigin = st?.configured && data.mode !== "live" && here !== callbackOrigin;
  const selected: "live" | "mock" = conn.requested === "mock" ? "mock" : "live";
  const liveNote = !st?.configured
    ? hosted
      ? "Add your Schwab keys in Vercel's environment variables first"
      : "Add your Schwab keys to .env.local first"
    : st.expired
      ? "Schwab login expired; reconnect below"
      : "Connect Schwab below to switch on";
  const schwabChip =
    data.mode === "live" ? <Chip tone="up">Connected</Chip> : st?.expired ? <Chip tone="down">Login expired</Chip> : st?.configured ? <Chip tone="warn">Ready to connect</Chip> : <Chip tone="warn">Not set up</Chip>;
  const t = settings.thresholds;
  const groups = [...new Set(THRESHOLD_FIELDS.map((f) => f.group))];
  const display = (key: keyof typeof t, unit: string) => {
    const v = t[key];
    return unit === "%" ? +(v * 100).toFixed(2) : v;
  };
  const changed = THRESHOLD_FIELDS.filter((f) => t[f.key] !== DEFAULT_THRESHOLDS[f.key]).length;

  return (
    <div className="flex flex-col gap-2">
      <PageHeader title="Settings" sub="Connections, accounts, and the rules behind every insight" />

      <ConfigCheck />

      <Card>
        <CardHeader title="Data source" right={data.mode === "live" ? <Chip tone="up">Showing live data</Chip> : <Chip tone="warn">Showing sample data</Chip>} />
        <DataSourceToggle selected={selected} live={data.mode === "live"} liveNote={liveNote} />
        {selected === "live" && data.mode !== "live" && (
          <p className="mt-2 text-[0.7188rem] text-fg-3">Live is selected; sample data shows until Schwab is connected.</p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Card>
          <CardHeader title="Schwab" right={schwabChip} />
          {justConnected && <p className="mb-2 rounded-lg bg-up/12 px-2.5 py-1.5 text-[0.75rem] text-up">Connected. Your Schwab accounts are loading now.</p>}
          {wrongOrigin && (
            <p className="mb-2 rounded-lg bg-warn/14 px-2.5 py-1.5 text-[0.75rem] text-warn">
              To connect, open <a className="underline" href={`${callbackOrigin}/settings`}>{callbackOrigin}/settings</a>. Schwab only returns to that address, and you&apos;re on {here}.
            </p>
          )}
          {error && <p className="mb-2 rounded-lg bg-down/14 px-2.5 py-1.5 text-[0.75rem] text-down">{error}</p>}
          {conn.notice === "error" && conn.error && <p className="mb-2 rounded-lg bg-down/14 px-2.5 py-1.5 text-[0.7188rem] text-down">Live data failed, so sample data is showing: {conn.error}</p>}
          {data.mode === "live" && schwabExpiresInMs != null ? (
            <>
              <p className="text-[0.75rem] text-fg-2">
                Live accounts, positions, transactions, quotes, and price history. Data refreshes every minute.
              </p>
              <p className="mt-2 text-[0.75rem] text-fg-2">
                Schwab login expires in <span className="text-fg">{expiresLabel(schwabExpiresInMs)}</span>. Schwab requires signing in again every 7 days.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href="/api/auth/schwab/login" className={btn}>
                  Reconnect now
                </a>
                <form action={refreshDataAction}>
                  <button className={btn}>Refresh data</button>
                </form>
                <form action={disconnectSchwabAction}>
                  <button className="rounded-lg px-3 py-1.5 text-[0.75rem] text-fg-3 hover:text-down">Disconnect</button>
                </form>
              </div>
            </>
          ) : (
            <>
              <p className="text-[0.75rem] text-fg-2">Accounts, positions, transactions, quotes, and price history come from the Schwab Trader API.</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-[0.7188rem] text-fg-3">
                <li>
                  In developer.schwab.com, open your app and set this callback URL exactly:
                  <code className="mt-1 block break-all rounded-md border border-line bg-bg px-2 py-1 text-[0.6875rem] text-fg-2">{callback}</code>
                </li>
                <li className={st?.configured ? "text-up" : ""}>
                  {hosted ? (
                    <>
                      Add <code className="text-fg-2">SCHWAB_APP_KEY</code> and <code className="text-fg-2">SCHWAB_APP_SECRET</code> in Vercel → Settings → Environment Variables (Production), then redeploy.
                    </>
                  ) : (
                    <>
                      Put your App Key and Secret in <code className="text-fg-2">.env.local</code>, then restart with <code className="text-fg-2">npm run dev</code>.
                    </>
                  )}
                  {st?.configured ? " Done." : ""}
                </li>
                <li>{hosted ? "Connect below." : "Open the app at https://127.0.0.1:3000 and connect below."} You&apos;ll sign in on Schwab&apos;s own site.</li>
              </ol>
              {st?.configured ? (
                <a href="/api/auth/schwab/login" className={`${btn} mt-3 inline-block`}>
                  {st.expired ? "Reconnect Schwab" : "Connect Schwab"}
                </a>
              ) : (
                <p className="mt-3 text-[0.7188rem] text-fg-3">{conn.requested === "mock" ? "DATA_MODE=mock is set, so sample data is forced." : `Waiting for ${missingKeys.join(" and ")}. See Server configuration above.`}</p>
              )}
            </>
          )}
        </Card>
        <Card>
          <CardHeader title="Finnhub" right={finnhubOn ? <Chip tone="up">Key added</Chip> : <Chip tone="warn">No key</Chip>} />
          <p className="text-[0.75rem] text-fg-2">Fills what Schwab doesn&apos;t provide: earnings dates, analyst ratings, sectors, and company news.</p>
          <p className="mt-2 text-[0.7188rem] text-fg-3">
            {finnhubOn
              ? data.mode === "live"
                ? "Used with live data. Results are cached (profiles weekly, ratings daily, news hourly) to stay inside the free tier, so the first load fills in over a minute or two."
                : "Ready. It's used once live Schwab data is on; sample data has its own built-in reference data."
              : "Add a free key from finnhub.io as FINNHUB_API_KEY. Without it, live data has no earnings dates, ratings, news, or sectors."}
          </p>
        </Card>
        <Card>
          <CardHeader title="Data" />
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[0.75rem]">
            <dt className="text-fg-3">Mode</dt>
            <dd>{data.mode === "live" ? "Live Schwab data" : `Sample data (DATA_MODE=${conn.requested})`}</dd>
            <dt className="text-fg-3">As of</dt>
            <dd>{fmtDate(data.asOf, "long")}</dd>
            <dt className="text-fg-3">Database</dt>
            <dd className={db.kind === "temporary" ? "text-warn" : ""}>
              {db.kind === "remote" ? "Turso (hosted)" : db.kind === "temporary" ? "Temporary: resets on restart. Add Turso." : "Local file · data/dashboard.db"}
            </dd>
            <dt className="text-fg-3">History</dt>
            <dd className="text-fg-3">{data.mode === "live" ? `${data.transactions.length} transactions stored · daily snapshots on` : "Sample ledger"}</dd>
          </dl>
        </Card>
      </div>

      <Card>
        <CardHeader title="Accounts" right="Names and tax treatment drive tax insights" />
        <form action={saveAccountsAction}>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {data.accounts.map((a) => (
              <div key={a.id} className="rounded-lg border border-line p-2.5">
                <div className="mb-1.5 flex items-center gap-2 text-[0.6875rem] text-fg-3">
                  <span className="h-2 w-2 rounded-[3px]" style={{ background: a.color }} />
                  Account {a.mask}
                </div>
                <label className="text-[0.6562rem] text-fg-3">
                  Name
                  <input name={`name:${a.accountNumber}`} defaultValue={a.name} className={`${input} mt-0.5`} />
                </label>
                <label className="mt-1.5 block text-[0.6562rem] text-fg-3">
                  Tax treatment
                  <select name={`tax:${a.accountNumber}`} defaultValue={a.taxTreatment} className={`${input} mt-0.5`}>
                    <option value="taxable">Taxable</option>
                    <option value="tax-deferred">Tax-deferred (Traditional / Rollover IRA, 401k)</option>
                    <option value="tax-free">Tax-free (Roth, HSA)</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <button type="submit" className={btn}>
              Save accounts
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Signal thresholds" right={changed ? `${changed} changed from defaults` : "Using defaults"} />
        <form action={saveThresholdsAction}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {groups.map((g) => (
              <fieldset key={g} className="rounded-lg border border-line p-2.5">
                <legend className="px-1 text-[0.6875rem] text-fg-2">{g}</legend>
                <div className="flex flex-col gap-1.5">
                  {THRESHOLD_FIELDS.filter((f) => f.group === g).map((f) => (
                    <label key={f.key} className="grid grid-cols-[1fr_88px] items-center gap-2 text-[0.7188rem] text-fg-2">
                      <span>{f.label}</span>
                      <span className="relative">
                        <input name={f.key} type="number" step="any" defaultValue={display(f.key, f.unit)} className={`${input} pr-9 text-right`} />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.625rem] text-fg-3">{f.unit === "score" || f.unit === "r2" || f.unit === "z" ? "" : f.unit}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button formAction={resetThresholdsAction} className="rounded-lg px-3 py-1.5 text-[0.75rem] text-fg-3 hover:text-fg-2">
              Reset to defaults
            </button>
            <button type="submit" className={btn}>
              Save thresholds
            </button>
          </div>
        </form>
      </Card>

      <p className="px-1 text-[0.6875rem] text-fg-3">
        Signals are mechanical rules applied to price, volume, and your positions. They aren&apos;t investment advice; you make the calls.
      </p>
    </div>
  );
}
