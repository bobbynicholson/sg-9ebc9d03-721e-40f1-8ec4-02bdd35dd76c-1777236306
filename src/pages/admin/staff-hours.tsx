import { useEffect } from "react";
import { useRouter } from "next/router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useTenantHref } from "@/lib/tenantUrl";
import { UserRole } from "@/types/app";

function StaffHoursRedirect() {
  const router = useRouter();
  const { withSlug } = useTenantHref();

  useEffect(() => {
    if (!router.isReady) return;
    const query = router.query;
    const wantsOrderAudit = query.tab === "monthly-audit" || Boolean(query.staff || query.department || query.view);
    const destination = wantsOrderAudit
      ? "/admin/wages?audit=orders#order-coverage-audit"
      : "/admin/wages";
    void router.replace(withSlug(destination));
  }, [router.isReady, router.query, router, withSlug]);

  return <div className="p-6 text-sm text-slate-500">Opening Wages…</div>;
}

export default function StaffHoursPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.COMPANY_ADMIN, UserRole.OWNER]} denyRoles={[UserRole.SUPER_ADMIN]}>
      <StaffHoursRedirect />
    </ProtectedRoute>
  );
}
