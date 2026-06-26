/**
 * /admin/kitchen-settings - standalone page wrapper.
 *
 * Wave 70.8 originally moved the form here from /team-portal/kitchen.
 * TIGHTEN I.30 (admin.md section 7 follow-up #5) factored the form
 * out into <KitchenRulesPanel /> so the same component can mount as
 * a tab on /admin/teams/kitchen. This page keeps the standalone URL
 * for deep-links + Settings nav muscle memory, but renders the
 * extracted panel.
 */
import Head from "next/head";
import { Settings } from "lucide-react";
import { DynamicNav } from "@/components/DynamicNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { KitchenRulesPanel } from "@/components/admin/KitchenRulesPanel";
import { useAuth } from "@/contexts/AuthContext";

function KitchenSettingsAdminPage() {
  const { user } = useAuth() as any;
  const userRole = (user?.active_role || user?.role || UserRole.ADMIN).toString();

  return (
    <>
      <NoIndexMeta />
      <Head><title>Kitchen rules - CateringMS</title></Head>
      <DynamicNav userRole={userRole} />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            title="Kitchen rules"
            icon={Settings}
            subtitle="Per-tenant policy: prep timing, BCEA shift thresholds, dietary alerts."
          />
          <PageWorkbench />

          <KitchenRulesPanel
            contextNote="These rules also surface as the 'Kitchen rules' tab inside the Kitchen team landing page (/admin/teams/kitchen) - either entry point edits the same companies.kitchen_settings JSON."
          />
        </PortalShell>
      </div>
    </>
  );
}

export default function ProtectedKitchenSettingsAdminPage() {
  // KS-B + I.30 preserved role gate. The intro copy says
  // admin-managed rules - allowlist mirrors the original page's
  // four-role set so the OWNER persona doesn't 403 here.
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN,
      UserRole.OWNER,
      UserRole.COMPANY_ADMIN,
      UserRole.ADMIN,
      UserRole.KITCHEN_MANAGER,
    ]}>
      <KitchenSettingsAdminPage />
    </ProtectedRoute>
  );
}
