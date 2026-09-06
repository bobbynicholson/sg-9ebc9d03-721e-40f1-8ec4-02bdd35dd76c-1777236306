import Link from "next/link";
import { ArrowLeft, SprayCan } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { TeamManagerWorkspace } from "@/components/admin/TeamManagerWorkspace";
import { CleaningPageShell } from "@/components/cleaning/CleaningPageShell";
import { Button } from "@/components/ui/button";
import { UserRole } from "@/types/app";
import { ManagerWorkModeCard } from "@/components/portal/ManagerWorkModeCard";

function CleaningManagementPage() {
  return (
    <CleaningPageShell
      pageTitle="Cleaning team management"
      heading="Manage the cleaning team"
      subheading="Clock cleaners in or out and keep the cleaning work diary."
      icon={SprayCan}
      headerAction={
        <Button asChild variant="outline" className="gap-2">
          <Link href="/team-portal/cleaning/dashboard" aria-label="Return to the cleaning dashboard">
            <ArrowLeft className="h-4 w-4" />
            Cleaning dashboard
          </Link>
        </Button>
      }
    >
      <div id="clock" className="scroll-mt-24">
        <ManagerWorkModeCard />
      </div>
      <TeamManagerWorkspace department="cleaning" />
    </CleaningPageShell>
  );
}

export default function CleaningManagementRoute() {
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER,
      UserRole.ADMIN, UserRole.REGION_ADMIN, UserRole.CLEANING_MANAGER,
    ]}>
      <CleaningManagementPage />
    </ProtectedRoute>
  );
}
