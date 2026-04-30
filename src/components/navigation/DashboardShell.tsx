/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DashboardShell -- the page-level wrapper used by every authenticated
 * portal page (admin, driver, kitchen, shopping, cleaning, client, and
 * the platform admin view).
 *
 * Why this exists:
 *   - We had 50+ admin pages each individually mounting <AdminNav /> and
 *     each individually setting `lg:pl-72 xl:pl-80` padding on their
 *     content wrapper. Adding a sidebar tweak meant editing 50 files;
 *     forgetting to set padding meant the page rendered under the
 *     sidebar.
 *   - The padding contract here matches UnifiedSidebar's width contract
 *     exactly: `lg:pl-64 xl:pl-72` to mirror `lg:w-64 xl:w-72`. No more
 *     32px gap mismatch, no more cards punching through.
 *   - Mobile gets `pt-16` to clear the fixed mobile bar (h-16) so content
 *     doesn't render under it.
 *
 * Usage:
 *   <DashboardShell role="admin">
 *     <YourPageContent />
 *   </DashboardShell>
 *
 * Pages that previously did
 *   <AdminNav />
 *   <div className="... lg:pl-72 xl:pl-80">
 *     <div className="px-4 py-8 max-w-screen-2xl mx-auto">{content}</div>
 *   </div>
 * become
 *   <DashboardShell role="admin">{content}</DashboardShell>
 */
import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { UnifiedSidebar } from "@/components/navigation/UnifiedSidebar";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { getNavForRole } from "@/config/navConfig";

export interface DashboardShellProps {
  /**
   * Which nav config to render. If omitted we resolve from the current
   * authenticated user's role. Pass an explicit value to force a
   * specific surface (e.g. "platform" for the super-admin platform view
   * even when the same user could also see admin).
   */
  role?: string;
  /** Page body. Wrapped in a centred max-width container by default. */
  children: ReactNode;
  /**
   * Override the default content max width. Defaults to "screen-2xl"
   * which renders nicely on big monitors without lines getting too long.
   */
  maxWidth?: "screen-2xl" | "7xl" | "6xl" | "5xl" | "4xl" | "full";
  /**
   * Background gradient. Most admin pages used the same slate->blue->purple
   * mix, so it's the default. Pass a different class to override.
   */
  background?: string;
  /** When true (default) apply the standard px-4 py-8 inner container
   *  padding. Pages that need full-bleed content (maps, tracking views)
   *  pass false and handle their own. */
  contained?: boolean;
}

const MAX_WIDTH_CLASS: Record<NonNullable<DashboardShellProps["maxWidth"]>, string> = {
  "screen-2xl": "max-w-screen-2xl",
  "7xl": "max-w-7xl",
  "6xl": "max-w-6xl",
  "5xl": "max-w-5xl",
  "4xl": "max-w-4xl",
  full: "max-w-full",
};

export function DashboardShell({
  role: explicitRole,
  children,
  maxWidth = "screen-2xl",
  background = "bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950",
  contained = true,
}: DashboardShellProps) {
  const { user, profile, company } = useAuth() as any;

  // Resolve the role. Explicit prop wins (lets /admin/platform/* pages
  // force the platform sidebar). Otherwise prefer the active role from
  // the auth context, falling back to the profile role.
  const resolvedRole: string =
    explicitRole ||
    (user?.active_role as string) ||
    (profile?.role as string) ||
    "admin";

  const nav = getNavForRole(resolvedRole);

  // Brand override: only admins / owners get the white-label tone. The
  // staff portals (driver, kitchen, shopping, cleaning) keep their fixed
  // role colours so the operational ergonomics stay consistent regardless
  // of which catering company the user belongs to.
  const isAdminLike =
    resolvedRole === "admin" ||
    resolvedRole === "owner" ||
    resolvedRole === "company_admin" ||
    resolvedRole === "super_admin";

  const brandPrimary = isAdminLike ? company?.primary_color || null : null;
  const brandSecondary = isAdminLike ? company?.secondary_color || null : null;
  const companyName = isAdminLike ? company?.company_name || profile?.company_name : undefined;
  const companyLogo = isAdminLike ? company?.logo_url || undefined : undefined;

  return (
    <>
      <NoIndexMeta />
      <UnifiedSidebar
        nav={nav}
        role={resolvedRole}
        brandPrimary={brandPrimary}
        brandSecondary={brandSecondary}
        companyName={companyName}
        companyLogo={companyLogo}
      />

      {/*
        Padding contract mirrors the sidebar width:
          lg:pl-64  ↔ lg:w-64  (256px)
          xl:pl-72  ↔ xl:w-72  (288px)
        pt-16 on mobile clears the fixed top bar (h-14 + border).
        No padding adjustment when collapsed -- sidebar still occupies
        20 (80px) of left edge but layout consistency wins over a 144px
        content gain that would re-flow on every collapse toggle.
      */}
      <div className={`min-h-screen ${background} pt-16 lg:pt-0 lg:pl-64 xl:pl-72`}>
        {contained ? (
          <main className={`${MAX_WIDTH_CLASS[maxWidth]} mx-auto px-4 py-8`}>{children}</main>
        ) : (
          <main>{children}</main>
        )}
        <Footer />
      </div>
    </>
  );
}
