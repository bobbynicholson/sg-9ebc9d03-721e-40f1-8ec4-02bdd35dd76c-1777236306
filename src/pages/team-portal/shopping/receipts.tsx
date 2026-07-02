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
import Link from "next/link";
import { Camera, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShoppingPageShell } from "@/components/shopping/ShoppingPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";
import { ChatBot } from "@/components/ChatBot";
import { ReceiptScanner } from "@/components/shopping/ReceiptScanner";

const MAX_FILES = 20;

function ShoppingReceiptsInner() {
  const { user } = useAuth() as any;
  const { withSlug } = useTenantHref();
  const companyId = (user?.user_metadata?.company_id as string | undefined) || null;

  return (
    <>
      <ShoppingPageShell
        pageTitle="Receipts - CateringMS"
        heading="Receipts"
        subheading={`Snap up to ${MAX_FILES} supplier slips per batch (JPG, PNG or WebP, 8 MB each). We extract supplier, date, line items and cost prices so nobody retypes them.`}
        icon={Camera}
        headerAction={
          <Button asChild variant="outline" size="sm">
            <Link href={withSlug("/team-portal/shopping/invoices")}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to spend
            </Link>
          </Button>
        }
      >
        <ReceiptScanner
          historyHref={withSlug("/team-portal/shopping/invoices")}
          accent="brand"
        />
      </ShoppingPageShell>

      <ChatBot userRole="shopping_staff" companyId={companyId || undefined} />
    </>
  );
}

// Route guard was missing on this page pre-restructure (the nav hid it
// but the URL was open to any signed-in role). Same allow-list as the
// shopping dashboard.
export default function ShoppingReceipts() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SHOPPING_STAFF, UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.REGION_ADMIN]}>
      <ShoppingReceiptsInner />
    </ProtectedRoute>
  );
}
