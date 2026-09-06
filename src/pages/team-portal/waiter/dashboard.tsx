import { Clock, Sparkles, CheckCircle2 } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { WaiterPageShell } from "@/components/waiter/WaiterPageShell";
import { WaiterServicePanel } from "@/components/waiter/WaiterServicePanel";
import { WaiterClockButton } from "@/components/waiter/WaiterClockButton";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";
import { PortalOverview } from "@/components/portal/ui";

function WaiterDashboardInner() {
  const { user } = useAuth();

  return (
    <WaiterPageShell
      pageTitle="Waiter Portal - CateringMS"
      heading="Service today"
      subheading="Assigned events, on-site phase taps, notes, and equipment return signals."
      icon={Sparkles}
      overview={
        <PortalOverview
          eyebrow="On-site service"
          title="Open each assigned event before you arrive"
          description="The service card shows venue, time, guests, the full order brief, and one-tap phase updates from arrival through event complete."
          items={[
            { label: "Assignments", value: "Live", helper: "From admin service-team assignment", icon: Sparkles, tone: "brand" },
            { label: "Phase taps", value: "6", helper: "On site to event complete", icon: CheckCircle2, tone: "neutral" },
            { label: "Clock", value: "Shift", helper: "Clock in before service", icon: Clock, tone: "neutral" },
          ]}
        />
      }
    >
      <div id="service" className="mb-4 sm:mb-6 scroll-mt-24">
        <WidgetErrorBoundary label="Service today">
          <WaiterServicePanel />
        </WidgetErrorBoundary>
      </div>

      {/* Waiter has its own shared role clock. Reusing the driver clock here
          made Waiter -> Kitchen handoffs appear as Driver -> Kitchen. */}
      <div id="clock" className="mb-4 sm:mb-6 scroll-mt-24">
        <WidgetErrorBoundary label="Shift clock">
          <WaiterClockButton userId={user?.id} companyId={user?.company_id} />
        </WidgetErrorBoundary>
      </div>
    </WaiterPageShell>
  );
}

export default function WaiterDashboardPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.WAITER,
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.REGION_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <WaiterDashboardInner />
    </ProtectedRoute>
  );
}
