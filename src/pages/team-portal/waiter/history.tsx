import { History } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { WaiterPageShell } from "@/components/waiter/WaiterPageShell";
import { WaiterServiceHistory } from "@/components/waiter/WaiterServiceHistory";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";

function WaiterHistoryPageInner() {
  return (
    <WaiterPageShell
      pageTitle="Completed service - Waiter Portal - CateringMS"
      heading="Completed service"
      subheading="Review the orders you served, each recorded service checkpoint, your notes and equipment returns."
      icon={History}
    >
      <WidgetErrorBoundary label="Completed waiter service">
        <WaiterServiceHistory />
      </WidgetErrorBoundary>
    </WaiterPageShell>
  );
}

export default function WaiterHistoryPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.WAITER, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.REGION_ADMIN, UserRole.ADMIN]}>
      <WaiterHistoryPageInner />
    </ProtectedRoute>
  );
}
