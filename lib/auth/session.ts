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

function secret(): string | null {
  const s = process.env.AUTH_SECRET;
  return s && s.length >= 32 ? s : null;
}

export function authConfigured(): boolean {
  return !!(secret() && process.env.AUTH_EMAIL && process.env.AUTH_PASSWORD_HASH);
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
    if (s.sub?.toLowerCase() !== process.env.AUTH_EMAIL?.toLowerCase()) return null; // email changed → old sessions end
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
