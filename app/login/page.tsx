import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[22rem]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-up to-accent" />
          <div>
            <h1 className="text-[1.25rem] font-medium tracking-tight">Portfolio</h1>
            <p className="text-[0.75rem] text-fg-3">Private dashboard. Sign in to continue.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-card p-5">
          <Suspense fallback={<div className="h-[15rem]" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
