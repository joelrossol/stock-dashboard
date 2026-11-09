import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { demoMode } from "@/lib/auth/session";
import { exchangeCode, SchwabAuthError } from "@/lib/data/schwab/auth";
import { clearLiveCache } from "@/lib/data/load";

const STATE_COOKIE = "schwab_oauth_state";

/** Schwab redirects here after sign-in with ?code=…&state=… */
export async function GET(req: NextRequest) {
  if (demoMode() || !(await currentUser())) return NextResponse.redirect(new URL("/login", req.url));
  const fail = (msg: string) => {
    const res = NextResponse.redirect(new URL(`/settings?schwab_error=${encodeURIComponent(msg)}`, req.url));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/schwab" });
    return res;
  };
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return fail(`Schwab returned: ${params.get("error_description") ?? params.get("error")}`);
  const code = params.get("code"); // URLSearchParams already decodes the "%40" Schwab puts in codes
  const state = params.get("state");
  const expected = req.cookies.get(STATE_COOKIE)?.value;
  if (!code) return fail("Schwab didn't return an authorization code.");
  if (!state || !expected || state !== expected) return fail("Sign-in check failed (state mismatch). Start the connection again from Settings.");
  try {
    await exchangeCode(code);
  } catch (e) {
    return fail(e instanceof SchwabAuthError ? e.message : "Couldn't finish connecting to Schwab.");
  }
  clearLiveCache();
  const res = NextResponse.redirect(new URL("/settings?connected=1", req.url));
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/schwab" });
  return res;
}
