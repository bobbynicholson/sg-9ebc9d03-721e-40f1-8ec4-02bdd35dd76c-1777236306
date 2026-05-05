/**
 * /admin/equipment/hire-orders -- standalone page wrapper.
 *
 * Renders the same HireInPanel the Equipment hub mounts on its
 * "Hire-in orders" tab. Kept as a discrete URL so the auto-generated
 * deep-links from quote-accepted notifications continue to resolve.
 */
import Head from "next/head";
import Link from "next/link";
import { useMemo } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Truck } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ChatBot } from "@/components/ChatBot";
import { HireInPanel } from "@/components/admin/equipment/HireInPanel";
import { useAuth } from "@/contexts/AuthContext";

function HireOrdersPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { user } = useAuth() as any;
  const companyId = (user?.user_metadata?.company_id as string | undefined) || (user?.company_id as string | undefined) || null;

  const slugPrefix = useMemo(() => {
    if (typeof window === "undefined") return "";
    const m = window.location.pathname.match(/^\/([^/]+)\/admin\//);
    return m ? `/${m[1]}` : "";
  }, []);

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Hire-in orders | CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-amber-50 to-orange-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-screen-2xl mx-auto">
          <Link href={`${slugPrefix}/admin/equipment`}>
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to equipment hub
            </Button>
          </Link>

          <div className="mb-6 flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl shadow-lg">
              <Truck className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                Hire-in orders
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Auto-generated procurement checklist for every quote that
                overcommits past your owned stock. Pick a supplier, mark
                pickup + return.
              </p>
            </div>
          </div>

          <HireInPanel />
        </div>
        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={companyId || undefined} />
    </>
  );
}

export default function ProtectedHireOrdersPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <HireOrdersPage />
    </ProtectedRoute>
  );
}
