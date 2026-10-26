import type { ReactNode } from "react";
import Head from "next/head";
import type { LucideIcon } from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { PageWorkbench, PortalHeader, PortalShell } from "@/components/portal/ui";
import { PortalRoleSwitchBar } from "@/components/portal/PortalRoleSwitchBar";

export type OperationalShellWidth = "narrow" | "wide" | "full";

export const OPERATIONAL_HERO_CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white";

export interface OperationalPortalPageShellProps {
  pageTitle: string;
  heading: ReactNode;
  subheading?: ReactNode;
  icon: LucideIcon;
  width?: OperationalShellWidth;
  headerAction?: ReactNode;
  meta?: ReactNode;
  overview?: ReactNode;
  children: ReactNode;
  hideFooter?: boolean;
  navigation: ReactNode;
  switchBorderClassName: string;
  switchDescription?: string;
}

/**
 * One responsive frame for the operational team portals. Role shells keep
 * their own navigation and accent, while title, context, spacing, mobile
 * offset, and footer behavior stay identical across kitchen, driver,
 * waiter, shopping, and cleaning pages.
 */
export function OperationalPortalPageShell({
  pageTitle,
  heading,
  subheading,
  icon,
  width = "wide",
  headerAction,
  meta,
  overview,
  children,
  hideFooter = false,
  navigation,
  switchBorderClassName,
  switchDescription,
}: OperationalPortalPageShellProps) {
  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>{pageTitle}</title>
      </Head>

      {navigation}

      <div className="min-h-screen overflow-x-hidden pt-16 lg:pl-72 lg:pt-0 xl:pl-80">
        <PortalShell width={width === "narrow" ? "narrow" : "default"}>
          <PortalRoleSwitchBar
            borderClassName={switchBorderClassName}
            description={switchDescription}
          />
          <PortalHeader
            variant="hero"
            title={heading}
            subtitle={subheading}
            icon={icon}
            actions={headerAction}
            meta={meta}
          />
          <PageWorkbench />
          {overview}

          <div id="main-content">{children}</div>

          {!hideFooter && (
            <div className="mt-12">
              <Footer />
            </div>
          )}
        </PortalShell>
      </div>
    </>
  );
}
