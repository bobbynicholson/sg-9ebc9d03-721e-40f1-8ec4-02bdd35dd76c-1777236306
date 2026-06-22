/**
 * /admin/equipment-damages - dedicated admin damage register.
 *
 * The same DamageAnalytics surface that lives as a tab on /admin/equipment,
 * promoted to its own top-level page + nav item so the operator can jump
 * straight to "what got broken, on which event, who do we charge" without
 * digging through the equipment hub tabs. Both entry points render the same
 * component, so there's a single source of truth.
 */
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import Head from "next/head";
import { AlertTriangle } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader } from "@/components/portal/ui";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ChatBot } from "@/components/ChatBot";
import { useAuth } from "@/contexts/AuthContext";
import { DamageAnalytics } from "@/components/cleaning/DamageAnalytics";

function EquipmentDamagesPage() {
  const { user } = useAuth() as any;
  const companyId =
    (user?.user_metadata?.company_id as string | undefined) ||
    (user?.company_id as string | undefined) ||
    null;

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Equipment damages - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Equipment damages"
            subtitle="Broken, lost and damaged gear by event - with the client and cost on each line, so you can chase a replacement or bill the responsible party."
            icon={AlertTriangle}
          />
          <DamageAnalytics />
        </PortalShell>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={companyId || undefined} />
    </>
  );
}

export default function ProtectedEquipmentDamagesPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.SUPER_ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.SALES_ADMIN,
        UserRole.REGION_ADMIN,
      ]}
    >
      <EquipmentDamagesPage />
    </ProtectedRoute>
  );
}
