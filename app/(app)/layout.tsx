import { Suspense } from "react";
import { MobileTabs } from "@/components/shell/MobileTabs";
import { Sidebar, SidebarShell } from "@/components/shell/Sidebar";
import { TopBar, TopBarFrame } from "@/components/shell/TopBar";
import { getPageContext } from "@/lib/context";

async function SidebarWithData() {
  const { data, model } = await getPageContext();
  return <Sidebar insightCount={model.urgentCount} mode={data.mode} />;
}

/** The signed-in dashboard shell. Everything under here requires a session. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <div className="flex min-h-dvh">
        <Suspense fallback={<SidebarShell />}>
          <SidebarWithData />
        </Suspense>
        <div className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={<TopBarFrame />}>
            <TopBar />
          </Suspense>
          <main className="mx-auto w-full max-w-[112.5rem] flex-1 px-3 pb-24 pt-3 md:px-4 md:pb-8">{children}</main>
        </div>
      </div>
      <Suspense fallback={null}>
        <MobileTabs />
      </Suspense>
    </>
  );
}
