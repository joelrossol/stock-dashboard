import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { Card, CardHeader, Chip } from "@/components/ui/primitives";
import { authProblems, demoMode } from "@/lib/auth/session";
import { callbackUrl } from "@/lib/data/schwab/auth";
import { databaseInfo } from "@/lib/db/client";
import { ENV_NAMES, readEnv, similarEnvNames } from "@/lib/env";

type State = "ok" | "missing" | "optional";

/** Which server variables this deployment actually sees. Names only, never values. */
export function ConfigCheck() {
  const key = readEnv(ENV_NAMES.schwabKey);
  const secret = readEnv(ENV_NAMES.schwabSecret);
  const finnhub = readEnv(ENV_NAMES.finnhub);
  const db = databaseInfo();
  const login = authProblems();
  const rows: { label: string; state: State; detail: string }[] = [
    demoMode()
      ? { label: "Login", state: "optional", detail: "Not set up, so the app runs in demo mode (sample data only). Run npm run set-password." }
      : { label: "Login", state: login.length ? "missing" : "ok", detail: login.length ? login.join("; ") : "AUTH_EMAIL, AUTH_PASSWORD_HASH, AUTH_SECRET" },
    { label: "Schwab App Key", state: key.name ? "ok" : "missing", detail: key.name ? `found as ${key.name}` : "SCHWAB_APP_KEY not found" },
    { label: "Schwab App Secret", state: secret.name ? "ok" : "missing", detail: secret.name ? `found as ${secret.name}` : "SCHWAB_APP_SECRET not found" },
    { label: "Finnhub", state: finnhub.name ? "ok" : "optional", detail: finnhub.name ? `found as ${finnhub.name}` : "FINNHUB_API_KEY not set (optional)" },
    { label: "Database", state: db.kind === "temporary" ? "optional" : "ok", detail: db.kind === "remote" ? "Turso (hosted)" : db.kind === "temporary" ? "Temporary; resets on restart. Add Turso." : "Local file" },
    { label: "Schwab callback URL", state: "ok", detail: callbackUrl() },
  ];
  const similar = similarEnvNames([key.name, secret.name, finnhub.name, "AUTH_EMAIL", "AUTH_PASSWORD_HASH", "AUTH_SECRET"]);
  if (db.kind === "remote" && !db.token) rows.splice(5, 0, { label: "Database token", state: "missing", detail: "Found the Turso URL but no auth token next to it" });
  const missing = rows.filter((r) => r.state === "missing").length;
  const icon = (s: State) =>
    s === "ok" ? <CheckCircle2 size={16} className="text-up" /> : s === "missing" ? <CircleAlert size={16} className="text-down" /> : <CircleDashed size={16} className="text-warn" />;

  return (
    <Card>
      <CardHeader title="Server configuration" right={missing ? <Chip tone="down">{missing} missing</Chip> : <Chip tone="up">All required set</Chip>} />
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-2 border-t border-line py-1.5 text-[0.75rem]">
            <span className="mt-0.5">{icon(r.state)}</span>
            <span className="w-36 shrink-0 text-fg-2">{r.label}</span>
            <span className="min-w-0 break-all text-fg-3">{r.detail}</span>
          </div>
        ))}
      </div>
      {similar.length > 0 && (
        <p className="mt-2 text-[0.7188rem] text-warn">Other similar variables this server sees (check for typos): {similar.join(", ")}</p>
      )}
      {missing > 0 && (
        <p className="mt-2 text-[0.7188rem] text-fg-3">
          {process.env.VERCEL
            ? "In Vercel → this project → Settings → Environment Variables, make sure each one has Production ticked, then Deployments → ⋯ → Redeploy."
            : "Add them to .env.local and restart the dev server."}
        </p>
      )}
    </Card>
  );
}
