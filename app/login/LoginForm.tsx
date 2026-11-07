"use client";

import { Lock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const next = useSearchParams().get("next") ?? "/";
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const field = "h-11 w-full rounded-lg border border-line bg-bg px-3 text-[0.875rem] outline-none placeholder:text-fg-3 focus:border-accent/70";
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1 text-[0.75rem] text-fg-2">
        Email
        <input name="email" type="email" autoComplete="username" required autoFocus className={field} />
      </label>
      <label className="flex flex-col gap-1 text-[0.75rem] text-fg-2">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={field} />
      </label>
      {state.error && <p className="rounded-lg bg-down/14 px-3 py-2 text-[0.75rem] text-down" role="alert">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex h-11 items-center justify-center gap-2 rounded-lg bg-accent text-[0.875rem] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <Lock size={15} />
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
