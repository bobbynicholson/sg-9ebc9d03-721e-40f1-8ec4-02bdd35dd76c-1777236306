import { ReactNode } from "react";
import Head from "next/head";
import { CheckCircle2 } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { PortalCard, PortalHeader, PortalShell } from "@/components/portal/ui";

interface PortalPagePlaceholderProps {
  /** Sidebar nav component for this portal (KitchenNav, ShoppingNav, etc) */
  Nav: React.ComponentType;
  /** Title shown in <head> */
  title: string;
  /** Heading icon */
  icon: React.ComponentType<{ className?: string }>;
  /** Heading shown on the page */
  heading: string;
  /** Subheading describing the feature */
  subheading: string;
  /** Tailwind gradient class for the icon block, e.g. "from-orange-500 to-red-500" */
  accent: string;
  /** Bullet list of what's coming for this feature */
  capabilities: string[];
  /** Optional extra content (charts, demo cards, etc) */
  children?: ReactNode;
}

/**
 * Reusable interim state for portal sub-pages that are not fully built yet.
 * The page still explains the workflow and keeps users oriented without
 * looking like a broken route.
 */
export function PortalPagePlaceholder({
  Nav,
  title,
  icon: Icon,
  heading,
  subheading,
  accent,
  capabilities,
  children,
}: PortalPagePlaceholderProps) {
  return (
    <>
      <NoIndexMeta />
      <Head><title>{title}</title></Head>
      <Nav />

      <div className="min-h-screen bg-slate-50 pt-16 dark:bg-slate-950 lg:pl-72 lg:pt-0 xl:pl-80">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent" width="narrow">
          <PortalHeader
            title={heading}
            subtitle={subheading}
            icon={Icon}
            actions={
              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                In progress
              </span>
            }
          />

          {children}

          <PortalCard className="mt-6">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-slate-950 dark:text-white">What this workspace will cover</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
                This page is reserved for the live workflow below. Until it is switched on, use the related dashboard and nav actions for current work.
              </p>
            </div>
            <ul className="space-y-3">
              {capabilities.map((c) => (
                <li key={c} className="flex items-start gap-3 text-sm leading-6 text-slate-700 dark:text-slate-300">
                  <CheckCircle2 className="mt-1 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </PortalCard>
        </PortalShell>
      </div>
    </>
  );
}
