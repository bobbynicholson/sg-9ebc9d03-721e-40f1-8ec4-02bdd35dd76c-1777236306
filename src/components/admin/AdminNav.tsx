/**
 * AdminNav -- thin wrapper that delegates to UnifiedSidebar.
 *
 * History: this file used to be a ~700 line hand-rolled sidebar with its
 * own mobile drawer, desktop fixed pane, and collapse logic. That code
 * now lives in UnifiedSidebar and the menu structure in navConfig.ts.
 * Every existing page that imports `<AdminNav />` keeps working without
 * changes -- the visual + behavioural change ships transparently.
 *
 * Once the page-level migration to `<DashboardShell role="admin">` lands
 * in commit 3, this file can be deleted.
 */
import { UnifiedSidebar } from "@/components/navigation/UnifiedSidebar";
import { ADMIN_NAV } from "@/config/navConfig";
import { useAuth } from "@/contexts/AuthContext";

export function AdminNav() {
  const { user, profile, company } = useAuth() as any;
  // Resolve the caller's role for inline gating (e.g. Platform Admin
  // section is only rendered for super_admin).
  const role: string =
    (user?.active_role as string) ||
    (profile?.role as string) ||
    "admin";

  return (
    <UnifiedSidebar
      nav={ADMIN_NAV}
      role={role}
      brandPrimary={company?.primary_color || null}
      brandSecondary={company?.secondary_color || null}
      companyName={company?.company_name || profile?.company_name}
      companyLogo={company?.logo_url}
    />
  );
}
