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
import { PortalShell, PortalHeader } from "@/components/portal/ui";

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
        <title>Receipts - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <DynamicNav userRole={UserRole.SHOPPING_STAFF} />

      <div className="overflow-x-hidden lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-screen">
          <div className="mb-4">
            <Link href={`${slugPrefix}/team-portal/shopping/invoices`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Spend
              </Button>
            </Link>
          </div>

          <PortalHeader
            icon={Camera}
            title={
              <span className="flex items-center gap-2">
                Receipts
                <InfoTooltip content={"Photograph supplier slips as they come in. We pull the supplier, line items and totals so cost prices on inventory stay current without anyone retyping them.\n\nUp to 20 photos in one batch. JPG, PNG and WebP, 8 MB per image."} />
              </span>
            }
            subtitle={`Snap up to ${MAX_FILES} supplier slips. The model extracts supplier, date, line items and cost prices.`}
          />

          <ReceiptScanner
            historyHref={`${slugPrefix}/team-portal/shopping/invoices`}
            accent="brand"
          />

          <Footer />
        </PortalShell>
      </div>

      <ChatBot userRole="shopping_staff" companyId={companyId || undefined} />
    </>
  );
}
