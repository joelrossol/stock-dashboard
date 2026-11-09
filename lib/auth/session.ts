/**
 * Signed session cookie (HMAC-SHA256 with AUTH_SECRET). Stateless, so it works
 * on Vercel without a session store. Sessions slide: 12 hours of inactivity
 * logs you out, and no session lives longer than 7 days.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "session";
export const IDLE_MS = 12 * 60 * 60 * 1000;
export const MAX_MS = 7 * 24 * 60 * 60 * 1000;
export const RENEW_AFTER_MS = 15 * 60 * 1000;

export interface Session {
  sub: string; // email
  iat: number; // issued (ms)
  seen: number; // last activity (ms)
}

/** Reads an env var, ignoring surrounding whitespace and quotes that sneak in when pasting into dashboards. */
export function envValue(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
}

function secret(): string | null {
  const s = envValue("AUTH_SECRET");
  return s.length >= 32 ? s : null;
}

export const authEmail = () => envValue("AUTH_EMAIL").toLowerCase();
export const authPasswordHash = () => envValue("AUTH_PASSWORD_HASH");

/** What's wrong with the login setup, by variable name only (never values). Empty = ready. */
export function authProblems(): string[] {
  const problems: string[] = [];
  const email = authEmail();
  const hash = authPasswordHash();
  const sec = envValue("AUTH_SECRET");
  if (!email) problems.push("AUTH_EMAIL is missing");
  else if (!/^[^@\s]+@[^@\s]+$/.test(email)) problems.push("AUTH_EMAIL isn't an email address");
  if (!hash) problems.push("AUTH_PASSWORD_HASH is missing");
  else if (!/^scrypt:\d+:\d+:\d+:[\w-]+:[\w-]+$/.test(hash)) problems.push("AUTH_PASSWORD_HASH isn't a password hash (it should start with \"scrypt:\"; paste the value from .env.local, not your password)");
  if (!sec) problems.push("AUTH_SECRET is missing");
  else if (sec.length < 32) problems.push(`AUTH_SECRET is too short (${sec.length} characters; needs 32+)`);
  return problems;
}

export function authConfigured(): boolean {
  return authProblems().length === 0;
}

/**
 * Demo mode: none of the login variables are set, so the app opens straight
 * into sample data for anyone, and live data and Schwab stay locked. If any
 * of them is set, even wrongly, the app stays behind the login instead, so a
 * typo can't open up a real setup.
 */
export function demoMode(): boolean {
  return !envValue("AUTH_EMAIL") && !envValue("AUTH_PASSWORD_HASH") && !envValue("AUTH_SECRET");
}

const sign = (data: string, key: string) => createHmac("sha256", key).update(data).digest("base64url");

export function encodeSession(s: Session): string {
  const key = secret();
  if (!key) throw new Error("AUTH_SECRET is missing");
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

export function decodeSession(token: string | undefined, now = Date.now()): Session | null {
  const key = secret();
  if (!token || !key) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
    if (s.sub?.toLowerCase() !== authEmail()) return null; // email changed → old sessions end
    if (now - s.seen > IDLE_MS || now - s.iat > MAX_MS) return null;
    return s;
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const, // "lax" so the Schwab redirect back still carries your session
  path: "/",
  maxAge: MAX_MS / 1000,
};
