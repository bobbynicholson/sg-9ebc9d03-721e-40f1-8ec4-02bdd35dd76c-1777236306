import { useCallback, useState } from "react";
import { Clock, Sparkles, CheckCircle2, CalendarDays, Users } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { WaiterPageShell, WAITER_HERO_CHIP } from "@/components/waiter/WaiterPageShell";
import { WaiterServicePanel, type WaiterServiceSummary } from "@/components/waiter/WaiterServicePanel";
import { WaiterClockButton } from "@/components/waiter/WaiterClockButton";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";
import { StatTile } from "@/components/portal/ui";

function WaiterDashboardInner() {
  const { user } = useAuth();
  // Real counts from the service panel (it owns the data + realtime).
  const [summary, setSummary] = useState<WaiterServiceSummary | null>(null);
  const onSummary = useCallback((next: WaiterServiceSummary) => setSummary(next), []);
  const ready = summary && !summary.loading && !summary.failed;
  const value = (n: number) => (ready ? n : "--");

  return (
    <WaiterPageShell
      pageTitle="Waiter Portal - CateringMS"
      heading="Service today"
      subheading={
        ready
          ? summary.events > 0
            ? `${summary.events} event${summary.events === 1 ? "" : "s"} assigned to you in the next 48 hours. Open each one before you arrive.`
            : "No events assigned to you in the next 48 hours."
          : "Your assigned events, the order brief and on-site progress in one place."
      }
      icon={Sparkles}
      meta={
        ready ? (
          <>
            <span className={WAITER_HERO_CHIP}>
              <span className={`h-1.5 w-1.5 rounded-full ${summary.today > 0 ? "bg-amber-300" : "bg-emerald-400"}`} />
              {summary.today > 0 ? `${summary.today} today` : "Nothing today"}
            </span>
            <span className={WAITER_HERO_CHIP}>
              <CalendarDays className="h-3 w-3" />
              {summary.events} in 48h
            </span>
          </>
        ) : undefined
      }
    >
      {/* Clock first, as on the kitchen and shopping portals. Waiter has its
          own shared role clock - reusing the driver clock here made
          Waiter -> Kitchen handoffs appear as Driver -> Kitchen. */}
      <div id="clock" className="mb-4 sm:mb-6 scroll-mt-24">
        <WidgetErrorBoundary label="Shift clock">
          <WaiterClockButton userId={user?.id} companyId={user?.company_id} />
        </WidgetErrorBoundary>
      </div>

      {/* Tiles hide on a failed load so zeros never stand in for an error;
          the panel below shows the retry card instead. */}
      {!summary?.failed && (
        <div className="grid grid-cols-1 gap-3 mb-6 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <StatTile icon={Clock} label="Today" value={value(summary?.today ?? 0)} hint="Events you serve today" />
          <StatTile icon={CalendarDays} label="Next 48 hours" value={value(summary?.events ?? 0)} hint="Assigned to you" />
          <StatTile icon={Users} label="Guests" value={value(summary?.guests ?? 0)} hint="Across those events" />
          <StatTile icon={CheckCircle2} label="Completed" value={value(summary?.completed ?? 0)} hint="Service marked complete" />
        </div>
      )}

      <div id="service" className="mb-4 sm:mb-6 scroll-mt-24">
        <WidgetErrorBoundary label="Service today">
          <WaiterServicePanel onSummary={onSummary} />
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
