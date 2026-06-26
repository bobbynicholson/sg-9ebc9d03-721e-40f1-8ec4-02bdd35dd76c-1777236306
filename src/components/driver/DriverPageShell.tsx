/**
 * DriverPageShell - the canonical outer layout for every driver-portal
 * page (except the welcome dashboard which has its own treatment).
 *
 * Minimal + premium portal standard: this shell now renders the shared
 * PortalShell + PortalHeader primitives (slate ground, amber accent,
 * soft shadow + hairline, full dark mode) inside the DriverNav
 * sidebar-offset gutter (lg:pl-72 xl:pl-80) - the same pattern the
 * shopping portal uses. One restrained background and header chip
 * style across every driver page; pages pass
 * `width="narrow" | "wide" | "full"` to opt into the right inner
 * max-width.
 */
import { ReactNode } from "react";
import { DriverNav } from "@/components/navigation/DriverNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import { LucideIcon } from "lucide-react";
import { PageWorkbench, PortalHeader } from "@/components/portal/ui";

type ShellWidth = "narrow" | "wide" | "full";

interface DriverPageShellProps {
  /** Browser tab title. */
  pageTitle: string;
  /** Big H1. */
  heading: string;
  /** One-line caption under the H1. */
  subheading?: string;
  /** Lucide icon component for the gradient chip next to the H1. */
  icon: LucideIcon;
  /**
   * Container max-width:
   *   narrow (4xl) - detail / settings / focused single-task pages
   *     (tracking, profile, notifications)
   *   wide (screen-2xl) - grids and dashboards (calendar, today)
   *   full - left/right layouts that want the full lg+ width
   *     (routes with its map)
   */
  width?: ShellWidth;
  /** Optional content on the top-right of the header (action button). */
  headerAction?: ReactNode;
  /** Optional first-screen summary band. */
  overview?: ReactNode;
  /** Page body. */
  children: ReactNode;
  /** Hide the standard footer when the page mounts its own (chat dock etc). */
  hideFooter?: boolean;
}

const WIDTH_CLASSES: Record<ShellWidth, string> = {
  narrow: "max-w-4xl",
  wide: "max-w-screen-2xl",
  full: "max-w-full",
};

export function DriverPageShell({
  pageTitle,
  heading,
  subheading,
  icon: Icon,
  width = "wide",
  headerAction,
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

      {/* Neutral slate ground inside the DriverNav sidebar gutter -
          same offset pattern the shopping portal uses. PortalShell
          rides on bg-transparent so this wrapper owns the ground and
          the inner container keeps the per-page width ladder. */}
      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className={`mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 ${WIDTH_CLASSES[width]}`}>
          {/* Shared portal header: amber-glyph neutral icon tile,
              semibold slate title, dark-mode aware. */}
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
