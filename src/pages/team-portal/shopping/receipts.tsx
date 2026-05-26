/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /team-portal/shopping/receipts - shopping team's daily receipt scanner.
 *
 * Same engine as /admin/onboarding/receipts but mounted inside the
 * shopping portal so the team can capture supplier slips as they
 * land, without bouncing into the admin section.
 *
 * Backed by the shared <ReceiptScanner/> component so behaviour stays
 * in lockstep across the two surfaces.
 */
import Head from "next/head";
import Link from "next/link";
import { useMemo } from "react";
import { Camera, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Footer } from "@/components/Footer";
import { DynamicNav } from "@/components/DynamicNav";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ReceiptScanner } from "@/components/shopping/ReceiptScanner";

const MAX_FILES = 20;

export default function ShoppingReceipts() {
  const { user } = useAuth() as any;
  const companyId = (user?.user_metadata?.company_id as string | undefined) || null;

  const slugPrefix = useMemo(() => {
    if (typeof window === "undefined") return "";
    const m = window.location.pathname.match(/^\/([^/]+)\/team-portal\//);
    return m ? `/${m[1]}` : "";
  }, []);

  return (
    <>
      <Head>
        <title>Receipt scanner - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <DynamicNav userRole={UserRole.SHOPPING_STAFF} />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 lg:py-12 max-w-full">

          <div className="mb-4">
            <Link href={`${slugPrefix}/team-portal/shopping/dashboard`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to shopping
              </Button>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 mb-6 sm:mb-8">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <Camera className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
                Receipt scanner
                <InfoTooltip content={"Photograph supplier slips as they come in. We pull the supplier, line items and totals so cost prices on inventory stay current without anyone retyping them.\n\nUp to 20 photos in one batch. JPG, PNG and WebP, 8 MB per image."} />
              </h1>
              <p className="text-xs sm:text-sm md:text-base text-slate-600">
                Snap up to {MAX_FILES} supplier slips. The model extracts supplier, date, line items and cost prices.
              </p>
            </div>
          </div>

          <ReceiptScanner
            historyHref={`${slugPrefix}/team-portal/shopping/dashboard`}
            accent="emerald"
          />
        </div>

        <Footer />
      </div>

      <ChatBot userRole="shopping_staff" companyId={companyId || undefined} />
    </>
  );
}
