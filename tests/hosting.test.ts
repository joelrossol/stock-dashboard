import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("hosting fallbacks", () => {
  it("uses a temporary database on Vercel without DATABASE_URL, and Turso's names when present", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("TURSO_DATABASE_URL", "");
    const { databaseInfo } = await import("@/lib/db/client");
    expect(databaseInfo().kind).toBe("temporary");
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://example-db.turso.io");
    expect(databaseInfo()).toMatchObject({ url: "libsql://example-db.turso.io", kind: "remote" });
  });

  it("derives the Schwab callback from the Vercel production domain", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("SCHWAB_CALLBACK_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "stocks.prodevelopr.com");
    vi.stubEnv("SCHWAB_APP_KEY", "k");
    vi.stubEnv("SCHWAB_APP_SECRET", "s");
    const { schwabConfig } = await import("@/lib/data/schwab/auth");
    expect(schwabConfig()?.callbackUrl).toBe("https://stocks.prodevelopr.com/api/auth/schwab/callback");
  });

  it("encrypts tokens with a key derived from AUTH_SECRET when TOKEN_ENCRYPTION_KEY is unset", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("AUTH_SECRET", "a".repeat(40));
    const { encrypt, decrypt } = await import("@/lib/crypto");
    expect(decrypt(encrypt("refresh-token-123"))).toBe("refresh-token-123");
  });
});

describe("env name aliases", () => {
  it("finds Schwab keys under alternate names and any letter case", async () => {
    vi.stubEnv("SCHWAB_APP_KEY", "");
    vi.stubEnv("SCHWAB_APP_SECRET", "");
    vi.stubEnv("Client_ID", " abc123 ");
    vi.stubEnv("Client_Secret", '"shh"');
    const { readEnv, ENV_NAMES } = await import("@/lib/env");
    expect(readEnv(ENV_NAMES.schwabKey)).toEqual({ value: "abc123", name: "Client_ID" });
    expect(readEnv(ENV_NAMES.schwabSecret)).toEqual({ value: "shh", name: "Client_Secret" });
  });
});

describe("Turso with a custom Vercel prefix", () => {
  it("finds the libsql URL and its matching token under any prefix", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.stubEnv("STOCKS_TURSO_DATABASE_URL", "libsql://stocks-me.turso.io");
    vi.stubEnv("STOCKS_TURSO_AUTH_TOKEN", "tok123");
    const { databaseInfo } = await import("@/lib/db/client");
    expect(databaseInfo()).toEqual({ url: "libsql://stocks-me.turso.io", token: "tok123", kind: "remote" });
  });
});
