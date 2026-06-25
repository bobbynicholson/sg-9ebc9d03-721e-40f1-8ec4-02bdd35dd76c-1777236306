/**
 * Wave 49 B3 - the kitchen-to-driver handover surface.
 *
 * Audit (Specialist 2) found the equipment_handovers table existed
 * with from_stage/to_stage columns but only the cleaning-side
 * EquipmentVerificationPanel ever wrote a row - and only for the
 * RETURN leg. The kitchen->driver handover (food + equipment loaded
 * onto the truck) had no UI, no write site, no proof. Drivers
 * jumped from "ready" straight to "delivered" with the system blind
 * to whether anything actually got loaded.
 *
 * This panel runs on the kitchen production / prep-list pages.
 * Per active order it shows:
 *   * the assigned driver name (from driver_assignments)
 *   * a single "Sign over to driver" tap by the kitchen lead
 *   * confirmed-state with timestamp + handed-over-by signature
 *
 * Writes:
 *   * equipment_handovers row (from_stage='kitchen', to_stage='driver')
 *
 * The gate that prevents `confirmDepartedKitchen` advancing the
 * order without this row lives in driverConfirmationService.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ArrowRightLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";

interface HandoverToDriverPanelProps {
  orderId: string;
  orderNumber: string;
}

interface HandoverState {
  loading: boolean;
  signed: boolean;
  signedAt?: string;
  signedByName?: string;
  driverName?: string;
  driverId?: string;
  notes?: string;
}

export function HandoverToDriverPanel({ orderId, orderNumber }: HandoverToDriverPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const [state, setState] = useState<HandoverState>({ loading: true, signed: false });

  const load = async () => {
    const companyId = (user as { company_id?: string } | null)?.company_id ?? null;
    if (!companyId) {
      setState({ loading: false, signed: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    try {
      // Existing kitchen->driver handover row, if any.
      const { data: handover } = await (supabase as any)
        .from("equipment_handovers")
        .select("id, handover_time, handed_over_by, notes")
        .eq("order_id", orderId)
        .eq("company_id", companyId)
        .eq("from_stage", "kitchen")
        .eq("to_stage", "driver")
        .order("handover_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Assigned driver name for display.
      const { data: assignment } = await (supabase as any)
        .from("driver_assignments")
        .select("driver_id, profiles:driver_id ( full_name )")
        .eq("order_id", orderId)
        .eq("company_id", companyId)
        .eq("assignment_type", "delivery")
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let signedByName: string | undefined;
      if (handover?.handed_over_by) {
        const { data: signer } = await (supabase as any)
          .from("profiles")
          .select("full_name")
          .eq("id", handover.handed_over_by)
          .maybeSingle();
        signedByName = (signer as any)?.full_name;
      }

      setState({
        loading: false,
        signed: !!handover,
        signedAt: handover?.handover_time,
        signedByName,
        driverId: (assignment as any)?.driver_id,
        driverName: (assignment as any)?.profiles?.full_name,
        notes: handover?.notes,
      });
    } catch (e) {
      console.warn("[HandoverToDriverPanel] load failed:", e);
      setState({ loading: false, signed: false });
    }
  };

  useEffect(() => {
    void load();
  }, [orderId, user?.company_id]);

  const handleSign = async () => {
    if (!user?.id) {
      toast({
        title: "Not signed in",
        description: "Please sign in before signing over an order.",
        variant: "destructive",
      });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    try {
      // Tag company_id so the row is correct for company-scoped reads +
      // the RLS check. Prefer the user's company; fall back to the order's.
      let companyId = (user as { company_id?: string } | null)?.company_id ?? null;
      if (!companyId) {
        const { data: ord } = await (supabase as any)
          .from("orders")
          .select("company_id")
          .eq("id", orderId)
          .maybeSingle();
        companyId = (ord as any)?.company_id ?? null;
      }
      const { error } = await (supabase as any)
        .from("equipment_handovers")
        .insert([{
          order_id: orderId,
          company_id: companyId,
          from_stage: "kitchen",
          to_stage: "driver",
          handed_over_by: user.id,
          received_by: state.driverId || null,
          received_by_user_id: state.driverId || null,
          handover_time: new Date().toISOString(),
        }]);
      if (error) throw error;
      toast({
        title: "Signed over to driver",
        description: `${orderNumber} is locked in for departure.`,
      });
      await load();
    } catch (e: any) {
      toast({
        title: "Sign-over failed",
        description: e?.message || "Try again",
        variant: "destructive",
      });
      setState((s) => ({ ...s, loading: false }));
    }
  };

  if (state.loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading handover state...
      </div>
    );
  }

  if (state.signed) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-200 bg-emerald-50">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-900">Signed over to driver</p>
            <p className="text-xs text-emerald-700">
              {state.signedByName ? `By ${state.signedByName} ` : ""}
              {state.signedAt ? `at ${new Date(state.signedAt).toLocaleString("en-ZA")}` : ""}
            </p>
          </div>
        </div>
        <Badge className="bg-emerald-500 border-emerald-600">Locked</Badge>
      </div>
    );
  }

  // Kitchen persona follow-up (kitchen.md 5.5): split states by
  // signal so the kitchen lead knows what action is actually needed.
  //   - No driver assigned yet  -> red, action: nudge dispatch
  //   - Driver assigned          -> amber, action: sign over
  // Previously both looked the same (amber "Awaiting handover sign-
  // off") which hid the dispatch escalation.
  if (!state.driverId) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg border border-rose-200 bg-rose-50">
        <div className="flex items-center gap-2 text-sm">
          <ArrowRightLeft className="h-4 w-4 text-rose-700" />
          <div>
            <p className="font-semibold text-rose-900">Ready, no driver assigned</p>
            <p className="text-xs text-rose-800">
              Food + equipment are ready. Dispatch hasn't assigned a driver yet.
            </p>
          </div>
        </div>
        <Button
          asChild
          size="sm"
          className="bg-rose-600 hover:bg-rose-700 text-white"
        >
          <a href={withSlug(`/admin/order-assignments?orderId=${encodeURIComponent(orderId)}`)}>
            Nudge dispatch
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50">
      <div className="flex items-center gap-2 text-sm">
        <ArrowRightLeft className="h-4 w-4 text-amber-700" />
        <div>
          <p className="font-semibold text-amber-900">Awaiting handover sign-off</p>
          <p className="text-xs text-amber-800">
            Driver: {state.driverName || "assigned"}. Tap when food + equipment are loaded.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        onClick={handleSign}
        disabled={state.loading}
        className="bg-brand-primary hover:bg-brand-primary/90 text-white"
      >
        Sign over to driver
      </Button>
    </div>
  );
}
