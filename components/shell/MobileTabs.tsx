"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { KeyRound, LogOut, MoreHorizontal } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { isActive, NAV, SETTINGS_NAV } from "./nav";

const PRIMARY = NAV.slice(0, 4);
const MORE = [...NAV.slice(4), SETTINGS_NAV];

export function MobileTabs({ demo = false }: { demo?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = MORE.some((n) => isActive(pathname, n.href));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {PRIMARY.map((n) => (
        <Link key={n.href} href={n.href} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.6562rem]", isActive(pathname, n.href) ? "text-fg" : "text-fg-3")}>
          <n.icon size={22} strokeWidth={1.8} />
          {n.label}
        </Link>
      ))}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.6562rem]", moreActive ? "text-fg" : "text-fg-3")}>
          <MoreHorizontal size={22} strokeWidth={1.8} />
          More
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-line-2 bg-card p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
            <Dialog.Title className="sr-only">More</Dialog.Title>
            {MORE.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-[0.875rem] hover:bg-card-2">
                <n.icon size={22} className="text-fg-3" />
                {n.label}
              </Link>
            ))}
            {demo ? (
              <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-[0.875rem] text-warn hover:bg-card-2">
                <KeyRound size={22} />
                Set up login
              </Link>
            ) : (
              <form action={logoutAction}>
                <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-[0.875rem] text-fg-2 hover:bg-card-2">
                  <LogOut size={22} className="text-fg-3" />
                  Sign out
                </button>
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </nav>
  );
}
