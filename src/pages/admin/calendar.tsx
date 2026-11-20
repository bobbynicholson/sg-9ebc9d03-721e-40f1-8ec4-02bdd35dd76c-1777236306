import { useEffect } from "react";
import { useRouter } from "next/router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalShell } from "@/components/portal/ui";
import { UserRole } from "@/types/app";
import { useTenantHref } from "@/lib/tenantUrl";

function CalendarRouteRedirect() {
  const router = useRouter();
  const { withSlug } = useTenantHref();
  const destination = withSlug("/admin/quotes?view=opportunity");

  useEffect(() => {
    void router.replace(destination);
  }, [destination, router]);

  return <PortalShell className="min-h-0 bg-transparent p-6">
    <p role="status" className="text-sm text-slate-600">Opening Opportunity Lab…</p>
  </PortalShell>;
}

/** The former admin event-calendar URL now opens the Opportunity Lab. */
export default function LegacyAdminCalendarRedirect() {
  return <ProtectedRoute allowedRoles={[
    UserRole.SUPER_ADMIN,
    UserRole.OWNER,
    UserRole.COMPANY_ADMIN,
    UserRole.ADMIN,
    UserRole.REGION_ADMIN,
    UserRole.SALES_ADMIN,
  ]}>
    <CalendarRouteRedirect />
  </ProtectedRoute>;
}
