import "server-only";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { cache } from "react";
import { requireUser } from "@/lib/auth/server";
import { loadPortfolioData } from "@/lib/data/load";
import { getSettings, getSuppression, getWatchlists } from "@/lib/db/queries";
import { buildModel } from "@/lib/model";

export const SCOPE_COOKIE = "scope";

/** Request-scoped: everything a page needs, deduped across layout + page. */
export const getPageContext = cache(async () => {
  // Sample data is anchored to "today", so it must render at request time.
  await io();
  await requireUser();
  const [jar, settings, suppression, watchlists] = await Promise.all([cookies(), getSettings(), getSuppression(), getWatchlists()]);
  const watchSymbols = watchlists.flatMap((w) => w.items.map((i) => i.symbol));
  const data = await loadPortfolioData(settings.accounts, watchSymbols);
  const requested = jar.get(SCOPE_COOKIE)?.value;
  const scope = requested && data.accounts.some((a) => a.id === requested) ? requested : "all";
  const model = buildModel(data, scope, settings.thresholds, suppression, watchlists);
  const exp = data.connection.status?.refreshExpiresAt;
  const schwabExpiresInMs = exp ? exp - Date.now() : null;
  return { data, model, settings, suppression, watchlists, watchSymbols, schwabExpiresInMs };
});

export type PageContext = Awaited<ReturnType<typeof getPageContext>>;
