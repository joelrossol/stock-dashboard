import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeSession, demoMode, SESSION_COOKIE, type Session } from "./session";

export async function currentUser(): Promise<Session | null> {
  const jar = await cookies();
  return decodeSession(jar.get(SESSION_COOKIE)?.value);
}

/** Second line of defense behind the proxy: every data load and action checks the session itself. */
export async function requireUser(): Promise<Session> {
  if (demoMode()) return { sub: "demo", iat: 0, seen: 0 };
  const s = await currentUser();
  if (!s) redirect("/login");
  return s;
}

/** For anything that reaches live data or Schwab: a real signed-in session, never demo mode. */
export async function requireOwner(): Promise<Session> {
  if (demoMode()) throw new Error("Set up a login first. Live data stays off in demo mode.");
  return requireUser();
}
