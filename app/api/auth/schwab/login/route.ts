import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { randomState } from "@/lib/crypto";
import { authorizeUrl, SchwabAuthError, schwabConfig } from "@/lib/data/schwab/auth";

const STATE_COOKIE = "schwab_oauth_state";

/** Starts the Schwab sign-in: sets a one-time state cookie and redirects to Schwab. */
export async function GET(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.redirect(new URL("/login", req.url));
  // The sign-in cookie only comes back if we start on the same origin Schwab returns to.
  const cfg = schwabConfig();
  if (cfg) {
    const callbackOrigin = new URL(cfg.callbackUrl).origin;
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
    const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
    if (`${proto}://${host}` !== callbackOrigin) {
      const msg = `Open ${callbackOrigin}/settings to connect. Schwab only returns to ${callbackOrigin}, and this page is at ${proto}://${host}.`;
      return NextResponse.redirect(new URL(`/settings?schwab_error=${encodeURIComponent(msg)}`, req.url));
    }
  }
  try {
    const state = randomState();
    const res = NextResponse.redirect(authorizeUrl(state));
    res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth/schwab", maxAge: 600 });
    return res;
  } catch (e) {
    const msg = e instanceof SchwabAuthError ? e.message : "Couldn't start the Schwab sign-in.";
    return NextResponse.redirect(new URL(`/settings?schwab_error=${encodeURIComponent(msg)}`, req.url));
  }
}
