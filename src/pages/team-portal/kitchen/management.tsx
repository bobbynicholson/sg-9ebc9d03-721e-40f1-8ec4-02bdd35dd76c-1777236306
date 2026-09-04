import Link from "next/link";
import { ArrowLeft, ChefHat } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { TeamManagerWorkspace } from "@/components/admin/TeamManagerWorkspace";
import { KitchenPageShell } from "@/components/kitchen/KitchenPageShell";
import { Button } from "@/components/ui/button";
import { UserRole } from "@/types/app";

function KitchenManagementPage() {
  return (
    <KitchenPageShell
      pageTitle="Kitchen team management"
      heading="Manage the kitchen team"
      subheading="Clock staff in or out and keep the kitchen work diary."
      icon={ChefHat}
      headerAction={
        <Button asChild variant="outline" className="gap-2">
          <Link href="/team-portal/kitchen/today" aria-label="Return to the kitchen dashboard">
            <ArrowLeft className="h-4 w-4" />
            Kitchen dashboard
          </Link>
        </Button>
      }
    >
      <TeamManagerWorkspace department="kitchen" />
    </KitchenPageShell>
  );
}

export default function KitchenManagementRoute() {
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER,
      UserRole.ADMIN, UserRole.REGION_ADMIN, UserRole.KITCHEN_MANAGER,
    ]}>
      <KitchenManagementPage />
    </ProtectedRoute>
  );
}
