import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeSession, SESSION_COOKIE, type Session } from "./session";

export async function currentUser(): Promise<Session | null> {
  const jar = await cookies();
  return decodeSession(jar.get(SESSION_COOKIE)?.value);
}

/** Second line of defense behind the proxy: every data load and action checks the session itself. */
export async function requireUser(): Promise<Session> {
  const s = await currentUser();
  if (!s) redirect("/login");
  return s;
}
