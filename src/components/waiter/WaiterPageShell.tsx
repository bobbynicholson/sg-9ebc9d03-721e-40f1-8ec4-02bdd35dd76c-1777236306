import { ReactNode } from "react";
import Head from "next/head";
import { LucideIcon } from "lucide-react";
import { WaiterNav } from "@/components/navigation/WaiterNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { PageWorkbench, PortalHeader } from "@/components/portal/ui";

type ShellWidth = "narrow" | "wide" | "full";

const WIDTH_CLASSES: Record<ShellWidth, string> = {
  narrow: "max-w-4xl",
  wide: "max-w-screen-2xl",
  full: "max-w-full",
};

export function WaiterPageShell({
  pageTitle,
  heading,
  subheading,
  icon: Icon,
  width = "wide",
  headerAction,
  overview,
  children,
  hideFooter = false,
}: {
  pageTitle: string;
  heading: string;
  subheading?: string;
  icon: LucideIcon;
  width?: ShellWidth;
  headerAction?: ReactNode;
  overview?: ReactNode;
  children: ReactNode;
  hideFooter?: boolean;
}) {
  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <WaiterNav />
      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className={`mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 ${WIDTH_CLASSES[width]}`}>
          <PortalHeader
            title={heading}
            subtitle={subheading}
            icon={Icon}
            actions={headerAction}
          />
          <PageWorkbench />
          {overview}
          {children}
          {!hideFooter && (
            <div className="mt-12">
              <Footer />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
