/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/onboarding/receipts - AI receipt scanner (admin entry).
 *
 * Operator drops up to 20 photos of supplier slips. Each goes through
 * Claude vision and comes back as structured fields: supplier, date,
 * total, line items with unit prices.
 *
 * For Callum's day-one onboarding: photograph the last 20 slips,
 * upload them all, and the system pre-loads cost prices on his
 * inventory in 30 seconds instead of an hour of typing.
 *
 * Same scanner is mounted at /team-portal/shopping/receipts for the
 * shopping team's ongoing slip captures, sharing this page's
 * ReceiptScanner component so they stay in lockstep.
 */
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Camera, ArrowLeft } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ReceiptScanner } from "@/components/shopping/ReceiptScanner";

const MAX_FILES = 20;

export default function ProtectedReceiptsImport() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <ReceiptsImportPage />
    </ProtectedRoute>
  );
}

function ReceiptsImportPage() {
  const { user } = useAuth() as any;
  const companyId = (user?.user_metadata?.company_id as string | undefined) || null;

  const slugPrefix = useMemo(() => {
    if (typeof window === "undefined") return "";
    const m = window.location.pathname.match(/^\/([^/]+)\/admin\//);
    return m ? `/${m[1]}` : "";
  }, []);

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Receipt scanner - CateringMS</title>
      </Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-screen-xl mx-auto">

          {/* Header */}
          <div className="mb-4">
            <Link href={`${slugPrefix}/admin/onboarding/imports`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to imports
              </Button>
            </Link>
          </div>

          <div className="mb-6 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary shadow-lg">
              <Camera className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 flex items-center gap-2">
                Receipt scanner
                <InfoTooltip content={"Snap photos of your last few weeks of supplier slips and we'll seed your inventory cost prices automatically.\n\nWe read each receipt and pull the supplier name, date, line items, quantities and totals. You review the extraction and commit, no typing required."} />
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Photograph up to {MAX_FILES} supplier slips. The model extracts supplier, date, line items and cost prices so your inventory loads itself.
              </p>
            </div>
          </div>

          <ReceiptScanner
            historyHref={`${slugPrefix}/admin/onboarding/imports`}
            accent="purple"
          />
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={companyId || undefined} />
    </>
  );
}
