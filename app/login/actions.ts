"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPassword } from "@/lib/auth/password";
import { authEmail, authPasswordHash, authProblems, cookieOptions, encodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { readSetting, writeSetting } from "@/lib/db/queries";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;

interface Lock {
  fails: number;
  first: number;
  until: number;
}

export interface LoginState {
  error?: string;
}

function safeNext(raw: FormDataEntryValue | null): string {
  const n = typeof raw === "string" ? raw : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : "/";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const problems = authProblems();
  if (problems.length) {
    const where = process.env.VERCEL ? `Fix in Vercel → Settings → Environment Variables (Production), then redeploy` : "Run npm run set-password, then restart the server";
    return { error: `Login isn't set up: ${problems.join("; ")}. ${where}.` };
  }
  const now = Date.now();
  const lock = await readSetting<Lock>("login_lock", { fails: 0, first: 0, until: 0 });
  if (lock.until > now) return { error: `Too many attempts. Try again in ${Math.ceil((lock.until - now) / 60_000)} minutes.` };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const passwordOk = verifyPassword(password, authPasswordHash()); // always run, so timing doesn't reveal the email
  const ok = passwordOk && email === authEmail();

  if (!ok) {
    const fresh = now - lock.first > WINDOW_MS;
    const fails = (fresh ? 0 : lock.fails) + 1;
    await writeSetting("login_lock", { fails, first: fresh ? now : lock.first, until: fails >= MAX_FAILS ? now + WINDOW_MS : 0 });
    await new Promise((r) => setTimeout(r, 500));
    return { error: fails >= MAX_FAILS ? "Too many attempts. Try again in 15 minutes." : "Email or password is incorrect." };
  }

  await writeSetting("login_lock", { fails: 0, first: 0, until: 0 });
  (await cookies()).set(SESSION_COOKIE, encodeSession({ sub: email, iat: now, seen: now }), cookieOptions);
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
