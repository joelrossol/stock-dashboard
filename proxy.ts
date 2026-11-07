import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, decodeSession, encodeSession, RENEW_AFTER_MS, SESSION_COOKIE } from "@/lib/auth/session";

const PUBLIC_PATHS = new Set(["/login", "/robots.txt"]);

/** Every request must carry a valid session, except the login page itself. */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
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
