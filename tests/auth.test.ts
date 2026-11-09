import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { decodeSession, encodeSession, IDLE_MS, MAX_MS } from "@/lib/auth/session";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-1234";
  process.env.AUTH_EMAIL = "owner@example.com";
});

describe("password hashing", () => {
  it("verifies the right password and rejects others", () => {
    const h = hashPassword("correct horse battery");
    expect(h).not.toContain("correct horse");
    expect(h).not.toContain("$");
    expect(verifyPassword("correct horse battery", h)).toBe(true);
    expect(verifyPassword("correct horse batterY", h)).toBe(false);
    expect(verifyPassword("anything", "garbage")).toBe(false);
  });

  it("salts each hash", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });
});

describe("sessions", () => {
  const now = Date.now();
  it("round-trips a valid session", () => {
    expect(decodeSession(encodeSession({ sub: "owner@example.com", iat: now, seen: now }))?.sub).toBe("owner@example.com");
  });

  it("rejects tampering, idle, too-old, and other-user sessions", () => {
    const good = encodeSession({ sub: "owner@example.com", iat: now, seen: now });
    expect(decodeSession(good.slice(0, -1) + (good.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(decodeSession(encodeSession({ sub: "owner@example.com", iat: now, seen: now - IDLE_MS - 1 }))).toBeNull();
    expect(decodeSession(encodeSession({ sub: "owner@example.com", iat: now - MAX_MS - 1, seen: now }))).toBeNull();
    expect(decodeSession(encodeSession({ sub: "someone@else.com", iat: now, seen: now }))).toBeNull();
    expect(decodeSession(undefined)).toBeNull();
  });
});

describe("login setup diagnostics", () => {
  const keep = { ...process.env };
  afterAll(() => {
    process.env = keep;
  });

  it("names exactly what's wrong, without values", async () => {
    const { authProblems } = await import("@/lib/auth/session");
    process.env.AUTH_EMAIL = "";
    process.env.AUTH_PASSWORD_HASH = "myPlainPassword!";
    process.env.AUTH_SECRET = "short";
    const p = authProblems().join(" | ");
    expect(p).toContain("AUTH_EMAIL is missing");
    expect(p).toContain("AUTH_PASSWORD_HASH isn't a password hash");
    expect(p).toContain("AUTH_SECRET is too short (5 characters");
    expect(p).not.toContain("myPlainPassword");
  });

  it("accepts values pasted with quotes or spaces", async () => {
    const { authProblems, authEmail } = await import("@/lib/auth/session");
    const { hashPassword } = await import("@/lib/auth/password");
    process.env.AUTH_EMAIL = '  "Owner@Example.com" ';
    process.env.AUTH_PASSWORD_HASH = ` '${hashPassword("long enough pw")}' `;
    process.env.AUTH_SECRET = ` ${"x".repeat(40)}\n`;
    expect(authProblems()).toEqual([]);
    expect(authEmail()).toBe("owner@example.com");
  });
});

describe("demo mode", () => {
  const VARS = ["AUTH_EMAIL", "AUTH_PASSWORD_HASH", "AUTH_SECRET"] as const;
  const saved: Record<string, string | undefined> = {};
  beforeAll(() => VARS.forEach((v) => (saved[v] = process.env[v])));
  afterAll(() => VARS.forEach((v) => (saved[v] === undefined ? delete process.env[v] : (process.env[v] = saved[v]))));
  const setVars = (vals: Partial<Record<(typeof VARS)[number], string>>) => VARS.forEach((v) => (vals[v] === undefined ? delete process.env[v] : (process.env[v] = vals[v])));

  it("is on only when no login variable is set at all", async () => {
    const { demoMode } = await import("@/lib/auth/session");
    setVars({});
    expect(demoMode()).toBe(true);
    setVars({ AUTH_EMAIL: "  " });
    expect(demoMode()).toBe(true);
    // Any variable set, even a broken one, keeps the site locked.
    for (const v of VARS) {
      setVars({ [v]: "x" });
      expect(demoMode()).toBe(false);
    }
  });

  it("opens pages but closes the Schwab sign-in and login routes", async () => {
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("@/proxy");
    const go = (path: string) => proxy(new NextRequest(new URL(path, "https://127.0.0.1:3000")));

    setVars({});
    expect(go("/holdings").headers.get("location")).toBeNull();
    expect(go("/api/auth/schwab/login").headers.get("location")).toContain("/settings?schwab_error=");
    expect(go("/api/auth/schwab/callback?code=x").headers.get("location")).toContain("/settings?schwab_error=");
    expect(new URL(go("/login").headers.get("location")!).pathname).toBe("/");

    setVars({ AUTH_EMAIL: "owner@example.com", AUTH_SECRET: "test-secret-test-secret-test-secret-1234" });
    expect(go("/holdings").headers.get("location")).toContain("/login");
  });
});
