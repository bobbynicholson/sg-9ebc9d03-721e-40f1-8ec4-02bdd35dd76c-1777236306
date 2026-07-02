/**
 * DriverPageShell - the canonical outer layout for every driver-portal
 * page.
 *
 * Command-centre restructure: the shell now renders the same premium
 * stack the company-admin pages use - PortalShell ground (brand wash +
 * layered gradient), a hero PortalHeader painted in the tenant's own
 * colours (icon tile, meta chip row, actions band) and the
 * PageWorkbench context strip - inside the DriverNav sidebar-offset
 * gutter (lg:pl-72 xl:pl-80). Pages supply `meta` chips for live
 * counts and `headerAction` buttons; everything else is identical
 * across the portal so no driver page can drift off-standard again.
 */
import { ReactNode } from "react";
import { DriverNav } from "@/components/navigation/DriverNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import { LucideIcon } from "lucide-react";
import { PageWorkbench, PortalHeader, PortalShell } from "@/components/portal/ui";

type ShellWidth = "narrow" | "wide" | "full";

interface DriverPageShellProps {
  /** Browser tab title. */
  pageTitle: string;
  /** Big H1 inside the hero band. */
  heading: ReactNode;
  /** One-line caption under the H1. */
  subheading?: ReactNode;
  /** Lucide icon component for the white-glass chip next to the H1. */
  icon: LucideIcon;
  /**
   * Container max-width:
   *   narrow (centred max-w-3xl) - focused single-task pages
   *   wide / full - full desktop width (dashboards, lists, maps).
   *     Kept as two accepted values for call-site compatibility; both
   *     resolve to the full-width shell per the portal-width decision
   *     (centred wide layouts left a dead rail next to the sidebar).
   */
  width?: ShellWidth;
  /** Optional actions rendered on the hero band (buttons pick dark styling automatically). */
  headerAction?: ReactNode;
  /** Optional chip row under the hero subtitle - live counts, status pills.
   *  Use the white-glass chip recipe:
   *  `inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white` */
  meta?: ReactNode;
  /** Optional first-screen summary band. */
  overview?: ReactNode;
  /** Page body. */
  children: ReactNode;
  /** Hide the standard footer when the page mounts its own (chat dock etc). */
  hideFooter?: boolean;
}

export function DriverPageShell({
  pageTitle,
  heading,
  subheading,
  icon: Icon,
  width = "wide",
  headerAction,
  meta,
  overview,
  children,
  hideFooter = false,
}: DriverPageShellProps) {
  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>{pageTitle}</title>
      </Head>

      <DriverNav />

      {/* PortalShell owns the ground (layered gradient + tenant brand
          wash) inside the DriverNav sidebar gutter - identical to the
          company-admin page treatment. */}
      <div className="min-h-screen overflow-x-hidden lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell width={width === "narrow" ? "narrow" : "default"}>
          <PortalHeader
            variant="hero"
            title={heading}
            subtitle={subheading}
            icon={Icon}
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
