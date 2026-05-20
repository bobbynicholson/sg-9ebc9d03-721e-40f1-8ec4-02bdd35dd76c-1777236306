/**
 * DriverPageShell - the canonical outer layout for every driver-portal
 * page (except the welcome dashboard which has its own treatment).
 *
 * Bobby's brief: the driver pages were drifting visually:
 *   - Routes / Tracking used `from-blue-50 via-cyan-50 to-teal-50`
 *   - Calendar / Notifications used `from-slate-50 to-blue-50`
 *   - Dashboard used `from-blue-50 via-indigo-50 to-purple-50`
 *   - Profile rendered on plain white
 *   - Header icon gradient was either blue->cyan OR blue->indigo
 *   - Container max-width was 3xl, 4xl, 6xl, screen-2xl, or full
 *     depending on the page
 *
 * This shell collapses those variants down to one consistent
 * background, header chip style and container ladder. Pages pass
 * `width="narrow" | "wide" | "full"` to opt into the right inner
 * max-width without re-deriving the wrapper class jungle.
 *
 * Sidebar offset (lg:pl-72 xl:pl-80) lives here so the DriverNav
 * + content alignment never falls out of sync again.
 */
import { ReactNode } from "react";
import { DriverNav } from "@/components/navigation/DriverNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import { LucideIcon } from "lucide-react";

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

      {/* Single canonical background gradient for every driver page.
          Slate->blue is the calmest of the four variants that were
          drifting; doesn't fight the in-page card colours and reads
          fine in both light + dark. */}
      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-blue-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className={`px-4 sm:px-6 md:px-8 py-6 sm:py-8 lg:py-12 ${WIDTH_CLASSES[width]}`}>
          {/* Standard page header: icon chip + H1 + optional caption,
              optional right-aligned action. The icon chip uses the
              blue->indigo gradient so the driver portal feels visually
              uniform alongside the sidebar's blue accent. */}
          <div className="mb-6 sm:mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shrink-0">
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900">
                  {heading}
                </h1>
                {subheading && (
                  <p className="text-sm sm:text-base text-slate-600 mt-1">{subheading}</p>
                )}
              </div>
            </div>
            {headerAction && <div className="shrink-0">{headerAction}</div>}
          </div>

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
