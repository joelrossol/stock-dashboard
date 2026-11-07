/**
 * Schwab OAuth 2.0 (authorization code). Access tokens last 30 minutes and are
 * refreshed automatically; the refresh token hard-expires 7 days after login,
 * after which you have to sign in to Schwab again.
 */
import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { deleteTokens, loadTokens, saveTokens } from "@/lib/db/queries";

const AUTHORIZE_URL = "https://api.schwabapi.com/v1/oauth/authorize";
const TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token";
const REFRESH_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const ACCESS_SKEW_MS = 60_000;

export class SchwabAuthError extends Error {
  constructor(
    message: string,
    readonly code: "not-configured" | "not-connected" | "expired" | "token-error",
  ) {
    super(message);
  }
}

export interface SchwabConfig {
  appKey: string;
  appSecret: string;
  callbackUrl: string;
}

export function schwabConfig(): SchwabConfig | null {
  const appKey = process.env.SCHWAB_APP_KEY?.trim();
  const appSecret = process.env.SCHWAB_APP_SECRET?.trim();
  const callbackUrl = process.env.SCHWAB_CALLBACK_URL?.trim() || "https://127.0.0.1:3000/api/auth/schwab/callback";
  if (!appKey || !appSecret) return null;
  return { appKey, appSecret, callbackUrl };
}

function requireConfig(): SchwabConfig {
  const c = schwabConfig();
  if (!c) throw new SchwabAuthError("Add SCHWAB_APP_KEY and SCHWAB_APP_SECRET to .env.local.", "not-configured");
  return c;
}

export function authorizeUrl(state: string): string {
  const c = requireConfig();
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("client_id", c.appKey);
  u.searchParams.set("redirect_uri", c.callbackUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return u.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const c = requireConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.appKey}:${c.appSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const expired = res.status === 400 || res.status === 401;
    throw new SchwabAuthError(`Schwab token request failed (${res.status}). ${text.slice(0, 200)}`, expired && body.grant_type === "refresh_token" ? "expired" : "token-error");
  }
  return (await res.json()) as TokenResponse;
}

/** Called from the OAuth callback with the `code` query parameter. */
export async function exchangeCode(code: string): Promise<void> {
  const c = requireConfig();
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: c.callbackUrl });
  const now = Date.now();
  await saveTokens({
    accessTokenEnc: encrypt(t.access_token),
    refreshTokenEnc: encrypt(t.refresh_token),
    accessExpiresAt: now + t.expires_in * 1000,
    refreshExpiresAt: now + REFRESH_LIFETIME_MS,
    updatedAt: now,
  });
}

let inflight: Promise<string> | null = null;

/** A valid access token, refreshing it first if needed. */
export async function getAccessToken(): Promise<string> {
  requireConfig();
  const stored = await loadTokens();
  if (!stored) throw new SchwabAuthError("Schwab isn't connected yet.", "not-connected");
  const now = Date.now();
  if (now >= stored.refreshExpiresAt) throw new SchwabAuthError("Your Schwab login expired. Reconnect to continue.", "expired");
  if (now < stored.accessExpiresAt - ACCESS_SKEW_MS) return decrypt(stored.accessTokenEnc);

  inflight ??= (async () => {
    try {
      const refreshToken = decrypt(stored.refreshTokenEnc);
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
      const at = Date.now();
      const rotated = t.refresh_token && t.refresh_token !== refreshToken;
      await saveTokens({
        accessTokenEnc: encrypt(t.access_token),
        refreshTokenEnc: encrypt(t.refresh_token || refreshToken),
        accessExpiresAt: at + t.expires_in * 1000,
        // Schwab's 7-day clock starts at sign-in and doesn't reset on refresh.
        refreshExpiresAt: rotated ? at + REFRESH_LIFETIME_MS : stored.refreshExpiresAt,
        updatedAt: at,
      });
      return t.access_token;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Force the next call to refresh (used after a 401). */
export async function invalidateAccessToken(): Promise<void> {
  const stored = await loadTokens();
  if (stored) await saveTokens({ ...stored, accessExpiresAt: 0 });
}

export interface SchwabStatus {
  configured: boolean;
  connected: boolean;
  expired: boolean;
  refreshExpiresAt: number | null;
  callbackUrl: string;
}

export async function schwabStatus(): Promise<SchwabStatus> {
  const c = schwabConfig();
  const callbackUrl = c?.callbackUrl ?? process.env.SCHWAB_CALLBACK_URL ?? "https://127.0.0.1:3000/api/auth/schwab/callback";
  if (!c) return { configured: false, connected: false, expired: false, refreshExpiresAt: null, callbackUrl };
  const stored = await loadTokens();
  if (!stored) return { configured: true, connected: false, expired: false, refreshExpiresAt: null, callbackUrl };
  const expired = Date.now() >= stored.refreshExpiresAt;
  return { configured: true, connected: !expired, expired, refreshExpiresAt: stored.refreshExpiresAt, callbackUrl };
}

export async function disconnectSchwab(): Promise<void> {
  await deleteTokens();
}
