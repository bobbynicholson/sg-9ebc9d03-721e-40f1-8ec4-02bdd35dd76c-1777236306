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
import { AdminNav } from "@/components/admin/AdminNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { KitchenRulesPanel } from "@/components/admin/KitchenRulesPanel";

function KitchenSettingsAdminPage() {
  return (
    <>
      <NoIndexMeta />
      <Head><title>Kitchen rules - CateringMS</title></Head>
      <AdminNav />

      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-3xl">

          <div className="mb-6 flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shadow-lg flex-shrink-0">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Kitchen rules</h1>
              <p className="text-sm text-slate-600 mt-1">
                Per-tenant policy: prep timing, BCEA shift thresholds, dietary alerts.
              </p>
            </div>
          </div>

          <KitchenRulesPanel
            contextNote="These rules also surface as the 'Kitchen rules' tab inside the Kitchen team landing page (/admin/teams/kitchen) - either entry point edits the same companies.kitchen_settings JSON."
          />
        </div>
      </main>
    </>
  );
}

export default function ProtectedKitchenSettingsAdminPage() {
  // KS-B + I.30 preserved role gate. The intro copy says
  // "Owner / admin only" - allowlist mirrors the original page's
  // four-role set so the OWNER persona doesn't 403 here.
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN,
      UserRole.OWNER,
      UserRole.COMPANY_ADMIN,
      UserRole.ADMIN,
    ]}>
      <KitchenSettingsAdminPage />
    </ProtectedRoute>
  );
}
