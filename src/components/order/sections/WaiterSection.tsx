/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: waiter section - service-phase progress per assigned waiter.
 * Reads event_attendance rows (one per waiter per order).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { UserRole } from "@/types/app";
import { Sparkles, Loader2, CheckCircle2, Clock, Package, UserPlus, XCircle, AlertCircle } from "lucide-react";

interface Props {
  orderId: string;
  companyId: string;
  serviceRequired?: boolean;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  highlight?: boolean;
}

interface Attendance {
  id: string;
  waiter_id: string;
  arrived_at: string | null;
  setup_started_at: string | null;
  guests_arrived_at: string | null;
  service_started_at: string | null;
  service_ended_at: string | null;
  event_complete_at: string | null;
  equipment_returned_at: string | null;
  notes: string | null;
  waiter?: { full_name: string | null } | null;
}

interface WaiterCandidate {
  id: string;
  full_name: string;
  email: string | null;
}

interface WaiterRequest {
  id: string;
  requested_at: string;
  summary: string;
}

const PHASES: Array<{ key: keyof Attendance; label: string }> = [
  { key: "arrived_at", label: "On site" },
  { key: "setup_started_at", label: "Setup started" },
  { key: "guests_arrived_at", label: "Guests arrived" },
  { key: "service_started_at", label: "Service started" },
  { key: "service_ended_at", label: "Service ended" },
  { key: "event_complete_at", label: "Event complete" },
];
const PHASE_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  PHASES.map((p) => [p.key as string, p.label]),
);

const ADMIN_ASSIGN_ROLES = new Set<string>([
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.COMPANY_ADMIN,
  UserRole.ADMIN,
  UserRole.REGION_ADMIN,
]);

function hasServiceStamp(row: Attendance): boolean {
  return !!(
    row.arrived_at ||
    row.setup_started_at ||
    row.guests_arrived_at ||
    row.service_started_at ||
    row.service_ended_at ||
    row.event_complete_at ||
    row.equipment_returned_at ||
    row.notes
  );
}

export function WaiterSection({ orderId, companyId, serviceRequired = false, defaultOpen, forceOpen, highlight }: Props) {
  const { user, userRoles } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [stamping, setStamping] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<WaiterCandidate[]>([]);
  const [waiterRequests, setWaiterRequests] = useState<WaiterRequest[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [selectedWaiterId, setSelectedWaiterId] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);

  // ODOC Phase 2: only the waiter themselves can stamp their own
  // phases (RLS also enforces this server-side, but we hide the
  // button for everyone else to avoid the dead-tap UX).
  const isWaiter = Array.isArray(userRoles)
    ? userRoles.includes(UserRole.WAITER)
    : user?.role === UserRole.WAITER;
  const canAssignWaiters = Array.isArray(userRoles)
    ? userRoles.some((role) => ADMIN_ASSIGN_ROLES.has(String(role)))
    : ADMIN_ASSIGN_ROLES.has(String(user?.role || ""));

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("event_attendance")
        .select("id, waiter_id, arrived_at, setup_started_at, guests_arrived_at, service_started_at, service_ended_at, event_complete_at, equipment_returned_at, notes, waiter:waiter_id(full_name)")
        .eq("order_id", orderId)
        .order("arrived_at", { ascending: true, nullsFirst: true });
      if (error) throw error;
      setRows((data || []) as Attendance[]);
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "loadWaiterSection", orderId, companyId } });
    } finally {
      setLoading(false);
    }
  }, [orderId, companyId]);

  const loadAdminContext = useCallback(async () => {
    if (!canAssignWaiters) return;
    setAdminLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/waiters`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Could not load waiter list (${res.status})`);
      setCandidates((data.candidates || []) as WaiterCandidate[]);
      setWaiterRequests((data.waiter_requests || []) as WaiterRequest[]);
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "loadWaiterAdminContext", orderId, companyId } });
      toast({ title: "Could not load waiter staff", description: e?.message, variant: "destructive" });
    } finally {
      setAdminLoading(false);
    }
  }, [canAssignWaiters, orderId, companyId, toast]);

  const stamp = async (attendanceId: string | null, phase: keyof Attendance) => {
    if (!user?.id || !user?.company_id) return;
    setStamping(`${attendanceId || "new"}-${phase as string}`);
    try {
      const nowIso = new Date().toISOString();
      if (attendanceId) {
        const { error } = await (supabase as any)
          .from("event_attendance")
          .update({ [phase]: nowIso })
          .eq("id", attendanceId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("event_attendance")
          .insert({
            company_id: user.company_id,
            order_id: orderId,
            waiter_id: user.id,
            [phase]: nowIso,
          });
        if (error) throw error;
      }
      toast({ title: PHASE_LABEL_BY_KEY[phase as string] || "Stamped", description: "Saved" });
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "stampWaiterPhase", phase: phase as string, orderId, companyId } });
      toast({ title: "Could not save", description: e?.message, variant: "destructive" });
    } finally {
      setStamping(null);
    }
  };

  useEffect(() => { loadRows(); }, [loadRows]);

  useEffect(() => { loadAdminContext(); }, [loadAdminContext]);

  // Realtime
  useEffect(() => {
    if (!orderId) return;
    const ch = supabase
      .channel(`order-doc-waiter:${orderId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "event_attendance", filter: `order_id=eq.${orderId}` },
        () => { loadRows(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId, loadRows]);

  const assignedIds = useMemo(() => new Set(rows.map((row) => row.waiter_id)), [rows]);
  const availableCandidates = useMemo(
    () => candidates.filter((candidate) => !assignedIds.has(candidate.id)),
    [candidates, assignedIds],
  );

  const assignWaiter = async () => {
    if (!selectedWaiterId) return;
    setAssigning(selectedWaiterId);
    try {
      const res = await fetch(`/api/orders/${orderId}/waiters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waiter_id: selectedWaiterId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Assign failed (${res.status})`);
      toast({
        title: "Waiter assigned",
        description: `${data.waiter?.full_name || "Staff member"} can now see this event in the waiter portal.`,
      });
      setSelectedWaiterId("");
      await Promise.all([loadRows(), loadAdminContext()]);
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "assignWaiter", orderId, companyId } });
      toast({ title: "Could not assign waiter", description: e?.message, variant: "destructive" });
    } finally {
      setAssigning(null);
    }
  };

  const unassignWaiter = async (waiterId: string) => {
    setAssigning(waiterId);
    try {
      const res = await fetch(`/api/orders/${orderId}/waiters`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waiter_id: waiterId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Unassign failed (${res.status})`);
      toast({ title: "Waiter unassigned" });
      await Promise.all([loadRows(), loadAdminContext()]);
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "unassignWaiter", orderId, companyId } });
      toast({ title: "Could not unassign waiter", description: e?.message, variant: "destructive" });
    } finally {
      setAssigning(null);
    }
  };

  const totalStamps = rows.reduce(
    (sum, r) => sum + PHASES.filter((p) => r[p.key]).length,
    0,
  );
  const maxStamps = rows.length * PHASES.length;
  const displaySummary = loading
    ? "Loading..."
    : rows.length === 0
      ? serviceRequired
        ? "Service required - no waiter assigned"
        : "No service team assigned"
      : totalStamps === 0
        ? `${rows.length} waiter${rows.length === 1 ? "" : "s"} assigned - no phase taps yet`
        : `${rows.length} waiter${rows.length === 1 ? "" : "s"} - ${totalStamps}/${maxStamps} phase taps`;
  return (
    <CollapsibleSection
      id="section-waiter"
      title="Service team"
      summary={displaySummary}
      icon={Sparkles}
      accent="amber"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      highlight={highlight}
    >
      {canAssignWaiters && (
        <div className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {(serviceRequired || waiterRequests.length > 0) && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div className="min-w-0">
                <p className="font-semibold">Waiter service needs attention</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  {waiterRequests.length > 0
                    ? waiterRequests[0].summary || "The client asked about waiter service in a pending change request."
                    : "This order is marked as needing waiter service."}
                </p>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Assign waiter
              </label>
              <select
                value={selectedWaiterId}
                onChange={(e) => setSelectedWaiterId(e.target.value)}
                disabled={adminLoading || availableCandidates.length === 0 || assigning !== null}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">
                  {adminLoading
                    ? "Loading waiters..."
                    : availableCandidates.length === 0
                      ? "No unassigned waiter users"
                      : "Choose waiter..."}
                </option>
                {availableCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.full_name}{candidate.email ? ` - ${candidate.email}` : ""}
                  </option>
                ))}
              </select>
              {!adminLoading && candidates.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  Add a staff user with the Waiter / Server role under Admin - Users first.
                </p>
              )}
            </div>
            <Button
              size="sm"
              onClick={assignWaiter}
              disabled={!selectedWaiterId || assigning !== null}
              className="h-9 bg-brand-primary text-white hover:opacity-90 sm:mt-5"
            >
              {assigning === selectedWaiterId
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
              Assign
            </Button>
          </div>
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-6 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading service team...
        </div>
      ) : rows.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">No on-site service phases recorded yet.</p>
          {isWaiter && (
            <Button
              size="sm"
              onClick={() => stamp(null, "arrived_at")}
              disabled={stamping !== null}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {stamping ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
              I'm on site
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const isMine = r.waiter_id === user?.id;
            // Next unstamped phase in the chain
            const nextPhase = PHASES.find((p) => !r[p.key]);
            return (
            <li key={r.id} className="border-l-2 border-amber-300 pl-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-semibold text-slate-900">
                  {r.waiter?.full_name || "Waiter"}
                  {isMine && <span className="ml-1 text-[10px] uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-200 rounded px-1 py-0.5">You</span>}
                </p>
                {isMine && isWaiter && nextPhase && (
                  <Button
                    size="sm"
                    onClick={() => stamp(r.id, nextPhase.key)}
                    disabled={stamping !== null}
                    className="h-7 text-xs bg-amber-600 hover:bg-amber-700"
                  >
                    {stamping === `${r.id}-${nextPhase.key as string}`
                      ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      : <CheckCircle2 className="w-3 h-3 mr-1" />}
                    {nextPhase.label}
                  </Button>
                )}
                {canAssignWaiters && !hasServiceStamp(r) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => unassignWaiter(r.waiter_id)}
                    disabled={assigning !== null}
                    className="h-7 text-xs border-slate-300 text-slate-600 hover:bg-slate-50"
                  >
                    {assigning === r.waiter_id
                      ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      : <XCircle className="w-3 h-3 mr-1" />}
                    Unassign
                  </Button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PHASES.map((p) => {
                  const stamped = r[p.key] as string | null;
                  return (
                    <div
                      key={p.key as string}
                      className={`text-xs p-1.5 rounded border flex items-center gap-1.5 ${
                        stamped
                          ? "bg-brand-primary/10 border-brand-primary/20 text-brand-primary"
                          : "bg-slate-50 border-slate-200 text-slate-500"
                      }`}
                    >
                      {stamped ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <Clock className="w-3 h-3 flex-shrink-0" />}
                      <span className="truncate">{p.label}</span>
                      {stamped && (
                        <span className="ml-auto tabular-nums text-[10px]">
                          {new Date(stamped).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {r.equipment_returned_at && (
                <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded px-1.5 py-0.5">
                  <Package className="w-3 h-3" />
                  Equipment returned {new Date(r.equipment_returned_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
              {r.notes && (
                <p className="mt-2 text-xs text-slate-700 bg-white border rounded p-2 whitespace-pre-wrap">
                  {r.notes}
                </p>
              )}
            </li>
            );
          })}
        </ul>
      )}
    </CollapsibleSection>
  );
}
