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
import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, ArrowLeft, AlertTriangle, RotateCcw } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ReceiptScanner } from "@/components/shopping/ReceiptScanner";
import { PortalShell, PortalHeader, PageWorkbench } from "@/components/portal/ui";

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

  // Preflight: the scan endpoint 500s outright when the server has no
  // AI key (ANTHROPIC_API_KEY / GROQ_API_KEY), which is the case in
  // prod today. Probe the quota endpoint (which now reports the same
  // gate) so the operator sees a clear offline banner up front instead
  // of staging 20 photos that are guaranteed to fail. Best effort: if
  // the probe itself fails we say nothing here and the scanner's own
  // persistent error banner still catches it at scan time.
  const [scannerHealth, setScannerHealth] = useState<{
    aiConfigured: boolean;
    used?: number;
    limit?: number;
  } | null>(null);
  const checkScanner = useCallback(async () => {
    try {
      const r = await fetch("/api/imports/receipts/quota", { credentials: "include" });
      if (!r.ok) return;
      const j = await r.json();
      setScannerHealth({
        // Older deployments of the endpoint don't return the flag;
        // treat missing as "assume fine" so we never false-alarm.
        aiConfigured: j.ai_configured !== false,
        used: typeof j.used === "number" ? j.used : undefined,
        limit: typeof j.limit === "number" ? j.limit : undefined,
      });
    } catch { /* probe is best effort */ }
  }, []);
  useEffect(() => { checkScanner(); }, [checkScanner]);

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Receipt scanner - CateringMS</title>
      </Head>
      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title={
              <span className="inline-flex items-center gap-2">
                Receipt scanner
                <InfoTooltip content={"Snap photos of your last few weeks of supplier slips and we'll seed your inventory cost prices automatically.\n\nWe read each receipt and pull the supplier name, date, line items, quantities and totals. You review the extraction and commit, no typing required."} />
              </span>
            }
            subtitle={`Photograph up to ${MAX_FILES} supplier slips. The model extracts supplier, date, line items and cost prices so your inventory loads itself.`}
            icon={Camera}
            meta={
              scannerHealth ? (
                <>
                  {scannerHealth.aiConfigured ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Scanner online
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                      Scanner offline
                    </span>
                  )}
                  {scannerHealth.used != null && scannerHealth.limit != null && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {scannerHealth.used} of {scannerHealth.limit} scans used this month
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
              <Link href={`${slugPrefix}/admin/onboarding/imports`}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to imports
                </Button>
              </Link>
            }
          />
          <PageWorkbench />

          {/* Scanner offline: every scan will 500 until the AI key is
              set server-side, so say it plainly with the fix instead of
              letting the operator find out after staging a batch. */}
          {scannerHealth && !scannerHealth.aiConfigured && (
            <Card className="mb-6 border-rose-200 bg-rose-50">
              <CardContent className="p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2 text-sm max-w-2xl">
                  <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-rose-900">Receipt scanning is offline on this server</p>
                    <p className="text-xs text-rose-800/90 mt-1 leading-relaxed">
                      The server has no AI key configured (ANTHROPIC_API_KEY or GROQ_API_KEY), so every
                      scan will fail. Ask your platform administrator to add the key to the production
                      environment variables and redeploy, then check again. Photos you pick are not
                      uploaded until you press Scan, so nothing is lost in the meantime.
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={checkScanner} className="bg-white">
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Check again
                </Button>
              </CardContent>
            </Card>
          )}

          <ReceiptScanner
            historyHref={`${slugPrefix}/admin/onboarding/imports`}
            accent="purple"
          />
        </PortalShell>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={companyId || undefined} />
    </>
  );
}
