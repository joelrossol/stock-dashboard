import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, decodeSession, demoMode, encodeSession, RENEW_AFTER_MS, SESSION_COOKIE } from "@/lib/auth/session";

const PUBLIC_PATHS = new Set(["/login", "/robots.txt"]);

/**
 * Every request must carry a valid session, except the login page itself.
 * In demo mode (no login set up) the sample-data app is open to anyone, but
 * the Schwab sign-in routes are closed.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (demoMode()) {
    if (pathname.startsWith("/api/auth/schwab")) {
      const msg = "Set up a login before connecting Schwab. See Data source below.";
      return NextResponse.redirect(new URL(`/settings?schwab_error=${encodeURIComponent(msg)}`, req.url));
    }
    if (pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  const session = decodeSession(req.cookies.get(SESSION_COOKIE)?.value);

  if (PUBLIC_PATHS.has(pathname)) {
    if (session && pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }

  if (!session) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  const now = Date.now();
  if (now - session.seen > RENEW_AFTER_MS) res.cookies.set(SESSION_COOKIE, encodeSession({ ...session, seen: now }), cookieOptions);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
