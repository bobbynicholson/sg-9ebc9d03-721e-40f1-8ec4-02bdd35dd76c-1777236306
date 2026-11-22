/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: waiter section - service-phase progress per assigned waiter.
 * Reads event_attendance rows (one per waiter per order).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserRole } from "@/types/app";
import { OrderContributors } from "../OrderContributors";
import { recordOrderContributor } from "@/services/order/orderContributors";
import { AlertCircle, Check, Circle, Clock, Loader2, Package, UserMinus, UserPlus, Users } from "lucide-react";
import styles from "./WaiterSection.module.css";

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
  role?: string | null;
  active_role?: string | null;
  is_active?: boolean;
  departments?: string[];
}

interface WaiterRequest {
  id: string;
  requested_at: string;
  summary: string;
}

const PHASES = [
  { key: "arrived_at", label: "On site", action: "Mark on site" },
  { key: "setup_started_at", label: "Setup started", action: "Mark setup started" },
  { key: "guests_arrived_at", label: "Guests arrived", action: "Mark guests arrived" },
  { key: "service_started_at", label: "Service started", action: "Start service" },
  { key: "service_ended_at", label: "Service ended", action: "End service" },
  { key: "event_complete_at", label: "Event complete", action: "Mark event complete" },
] as const;

type ServicePhase = (typeof PHASES)[number];

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

function ServiceTime({ value }: { value: string }) {
  const date = new Date(value);
  return (
    <time dateTime={value} className="inline-flex flex-wrap items-baseline gap-x-2 tabular-nums">
      <span className="whitespace-nowrap font-medium text-slate-800">
        {date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="whitespace-nowrap">
        {date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
      </span>
    </time>
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
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const assignmentId = useId();

  const friendlyRequestError = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : String(error || "");
    if (!message || /failed \(\d+\)|could not|something went wrong/i.test(message)) return fallback;
    return message;
  };

  // ODOC Phase 2: only the waiter themselves can stamp their own
  // phases (RLS also enforces this server-side, but we hide the
  // button for everyone else to avoid the dead-tap UX).
  const isWaiter = Array.isArray(userRoles)
    ? userRoles.includes(UserRole.WAITER)
    : user?.role === UserRole.WAITER;
  const canAssignWaiters = Array.isArray(userRoles)
    ? userRoles.some((role) => ADMIN_ASSIGN_ROLES.has(String(role)))
    : ADMIN_ASSIGN_ROLES.has(String(user?.role || ""));

  // Only the first load for an order shows the spinner. Live updates refresh
  // the rows in place so the section does not blink.
  const shownOrderRef = useRef<string | null>(null);
  const loadRows = useCallback(async () => {
    if (shownOrderRef.current !== orderId) setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("event_attendance")
        .select("id, waiter_id, arrived_at, setup_started_at, guests_arrived_at, service_started_at, service_ended_at, event_complete_at, equipment_returned_at, notes, waiter:waiter_id(full_name)")
        .eq("order_id", orderId)
        .order("arrived_at", { ascending: true, nullsFirst: true });
      if (error) throw error;
      setRows((data || []) as Attendance[]);
      setSectionError(null);
      shownOrderRef.current = orderId;
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "loadWaiterSection", orderId, companyId } });
      setSectionError("The service records couldn’t be loaded.");
    } finally {
      setLoading(false);
    }
  }, [orderId, companyId]);

  const loadAdminContext = useCallback(async () => {
    if (!canAssignWaiters) return;
    setAdminLoading(true);
    setAdminError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/waiters`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Could not load waiter list (${res.status})`);
      setCandidates((data.candidates || []) as WaiterCandidate[]);
      setWaiterRequests((data.waiter_requests || []) as WaiterRequest[]);
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "loadWaiterAdminContext", orderId, companyId } });
      setAdminError(friendlyRequestError(e, "The staff list couldn’t be loaded."));
    } finally {
      setAdminLoading(false);
    }
  }, [canAssignWaiters, orderId, companyId]);

  const stamp = async (attendanceId: string | null, phase: ServicePhase) => {
    if (!user?.id || !user?.company_id) return;
    const { key, label } = phase;
    setStamping(`${attendanceId || "new"}-${key}`);
    try {
      const nowIso = new Date().toISOString();
      if (attendanceId) {
        const { error } = await (supabase as any)
          .from("event_attendance")
          .update({ [key]: nowIso })
          .eq("id", attendanceId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("event_attendance")
          .insert({
            company_id: user.company_id,
            order_id: orderId,
            waiter_id: user.id,
            [key]: nowIso,
          });
        if (error) throw error;
      }
      // Credit this waiter on the order's "who helped" list so the order
      // doc shows who worked service. Best-effort - never block the stamp.
      void recordOrderContributor(orderId, user.id, "waiter");
      toast({ title: label, description: "Saved" });
      await loadRows();
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "stampWaiterPhase", phase: key, orderId, companyId } });
      toast({ title: "Service update couldn't be saved", description: `${friendlyRequestError(e, "We couldn't save this service update. Please try again.")} Your previous updates are still safe.`, variant: "destructive" });
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
        description: `${data.waiter?.full_name || "Staff member"} can now see this event in the waiter portal. ${data.notification_created ? "Waiter notification saved." : "Waiter notification was already present."} ${data.admin_notifications_created > 0 ? "Admin notifications sent." : "No new admin notification was needed."} ${data.assignment_email_sent ? "Assignment email sent." : "Assignment email was not sent (check their settings/provider)."}`,
      });
      setSelectedWaiterId("");
      await Promise.all([loadRows(), loadAdminContext()]);
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "assignWaiter", orderId, companyId } });
      toast({ title: "Waiter assignment couldn't be saved", description: `${friendlyRequestError(e, "We couldn't assign this waiter right now. Please try again.")} No changes were made.`, variant: "destructive" });
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
      toast({ title: "Waiter assignment couldn't be removed", description: friendlyRequestError(e, "We couldn't remove this waiter right now. Please try again."), variant: "destructive" });
    } finally {
      setAssigning(null);
    }
  };

  const totalRecorded = rows.reduce((sum, row) => sum + PHASES.filter((phase) => row[phase.key]).length, 0);
  const rosterLabel = `${rows.length} waiter${rows.length === 1 ? "" : "s"} assigned`;
  const progressLabel = `${totalRecorded} of ${rows.length * PHASES.length} steps recorded`;
  const displaySummary = loading
    ? "Loading service team…"
    : sectionError
      ? "Service records unavailable"
      : rows.length
        ? `${rosterLabel} · ${progressLabel}`
        : serviceRequired ? "Service required · no waiter assigned" : "No waiter assigned";
  const pendingRequest = waiterRequests[0];
  const showEmpty = !loading && !sectionError && rows.length === 0;
  const assignmentAvailable = !loading && !sectionError && !adminLoading && !adminError && assigning === null && stamping === null;

  return (
    <CollapsibleSection
      id="section-waiter"
      title="Service team"
      summary={displaySummary}
      icon={Users}
      accent="amber"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      highlight={highlight}
    >
      <div className={`${styles.panel} min-w-0 space-y-5 text-slate-800`}>
        {canAssignWaiters && pendingRequest && (
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 text-amber-950">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-800" />
            <div className="min-w-0">
              <p className="text-base font-semibold">Client requested waiter service</p>
              <p className="mt-1 text-sm leading-relaxed">{pendingRequest.summary || "See the pending change request for details."}</p>
            </div>
          </div>
        )}

        {loading && (
          <p role="status" className="flex items-center gap-3 py-4 text-sm text-slate-600">
            <Loader2 aria-hidden="true" className="size-5 shrink-0 animate-spin" />
            Loading service team…
          </p>
        )}
        {sectionError && !loading && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 p-4 text-red-900">
            <p role="alert" className="text-sm">{sectionError}</p>
            <Button type="button" variant="outline" className={`${styles.control} h-auto max-w-full whitespace-normal`} onClick={() => void loadRows()}>
              Retry service records
            </Button>
          </div>
        )}
        {showEmpty && (
          <div className="rounded-lg bg-slate-50 px-4 py-5">
            <div className="flex items-start gap-3">
              <Users aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-600" />
              <div>
                <h3 className="text-base font-semibold text-slate-950">No waiter assigned</h3>
                {serviceRequired && <p className="mt-1 text-sm text-slate-700">This order requires on-site service.</p>}
              </div>
            </div>
            {isWaiter && !forceOpen && (
              <Button
                type="button"
                onClick={() => void stamp(null, PHASES[0])}
                disabled={stamping !== null || assigning !== null}
                className={`${styles.control} mt-4 h-auto max-w-full whitespace-normal text-base`}
              >
                {stamping ? <Loader2 className="animate-spin" /> : <Check />}
                {PHASES[0].action}
              </Button>
            )}
          </div>
        )}
        {!loading && rows.length > 0 && (
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-950">{rosterLabel}</h3>
              <p className="text-sm tabular-nums text-slate-600">{progressLabel}</p>
            </div>
            <ul className="divide-y divide-slate-200" aria-label="Assigned waiters">
              {rows.map((row) => {
                const name = row.waiter?.full_name || "Waiter";
                const isMine = row.waiter_id === user?.id;
                const nextPhase = PHASES.find((phase) => !row[phase.key]);
                const recorded = PHASES.filter((phase) => row[phase.key]).length;
                const canStamp = !forceOpen && !sectionError && isMine && isWaiter && !!nextPhase;
                const canUnassign = !forceOpen && !sectionError && canAssignWaiters && !hasServiceStamp(row);
                return (
                  <li key={row.id} className="py-4 first:pt-4 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                      <div className="min-w-0 flex-auto">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h4 className="min-w-0 text-base font-semibold leading-snug tracking-tight text-slate-950 sm:text-lg">{name}</h4>
                          {isMine && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-700">You</span>}
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {!nextPhase ? "All service steps recorded" : recorded ? `Next: ${nextPhase.label}` : "Service not started"}
                        </p>
                      </div>
                      {(canStamp || canUnassign) && (
                        <div className={`${styles.personActions} flex min-w-0 flex-wrap gap-2`}>
                          {canStamp && nextPhase && (
                            <Button
                              type="button"
                              onClick={() => void stamp(row.id, nextPhase)}
                              disabled={stamping !== null || assigning !== null}
                              className={`${styles.control} h-auto max-w-full whitespace-normal text-base`}
                            >
                              {stamping === `${row.id}-${nextPhase.key}` ? <Loader2 className="animate-spin" /> : <Check />}
                              {nextPhase.action}
                            </Button>
                          )}
                          {canUnassign && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void unassignWaiter(row.waiter_id)}
                              disabled={assigning !== null || stamping !== null}
                              aria-label={`Unassign ${name}`}
                              className={`${styles.control} h-auto max-w-full whitespace-normal text-base`}
                            >
                              {assigning === row.waiter_id ? <Loader2 className="animate-spin" /> : <UserMinus />}
                              Unassign
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <ol className={`${styles.phases} mt-4 rounded-lg bg-slate-50 px-3`} aria-label={`Service steps for ${name}`}>
                      {PHASES.map((phase) => {
                        const recordedAt = row[phase.key];
                        const isNext = nextPhase === phase;
                        const Icon = recordedAt ? Check : isNext ? Clock : Circle;
                        return (
                          <li
                            key={phase.key}
                            aria-current={isNext ? "step" : undefined}
                            className={`${styles.phase} min-w-0 border-slate-200 py-2.5`}
                          >
                            <span className={`flex size-7 items-center justify-center rounded-full ${
                              recordedAt ? "bg-emerald-100 text-emerald-800" : isNext ? "bg-amber-100 text-amber-900" : "text-slate-500"
                            }`}>
                              <Icon aria-hidden="true" className="size-4" />
                            </span>
                            <span className="min-w-0 text-base font-medium leading-snug text-slate-900">{phase.label}</span>
                            <span className={`${styles.phaseDetail} min-w-0 text-sm leading-snug ${isNext ? "font-medium text-amber-900" : "text-slate-600"}`}>
                              {recordedAt ? <ServiceTime value={recordedAt} /> : isNext ? "Up next" : "Pending"}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                    {row.equipment_returned_at && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                        <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                          <Package aria-hidden="true" className="size-4 shrink-0" />
                          Equipment returned
                        </span>
                        <ServiceTime value={row.equipment_returned_at} />
                      </div>
                    )}
                    {row.notes && (
                      <div className="mt-3">
                        <p className="text-sm font-semibold text-slate-900">Service notes</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-base leading-relaxed text-slate-700">{row.notes}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <OrderContributors orderId={orderId} area="waiter" label="Served by" />

        {canAssignWaiters && !forceOpen && (
          <form
            className="border-t border-slate-200 pt-4 print:hidden"
            onSubmit={(event) => {
              event.preventDefault();
              if (assignmentAvailable && availableCandidates.some((candidate) => candidate.id === selectedWaiterId)) {
                void assignWaiter();
              }
            }}
          >
            {adminError ? (
              <div>
                <p className="text-base font-semibold text-slate-950">Assign a waiter</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-red-800">
                  <p role="alert">{adminError}</p>
                  <Button type="button" variant="outline" className={`${styles.control} h-auto max-w-full whitespace-normal`} onClick={() => void loadAdminContext()}>
                    Retry staff list
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <label htmlFor={assignmentId} className="block text-base font-semibold text-slate-950">Assign a waiter</label>
                <div className={`${styles.assignmentFields} mt-2 grid min-w-0 gap-2`}>
                  <div className="min-w-0">
                    <Select
                      value={selectedWaiterId}
                      onValueChange={setSelectedWaiterId}
                      disabled={!assignmentAvailable || availableCandidates.length === 0}
                    >
                      <SelectTrigger
                        id={assignmentId}
                        aria-describedby={`${assignmentId}-hint`}
                        className={`${styles.control} h-auto min-h-11 w-full min-w-0 whitespace-normal rounded-md border border-slate-300 bg-white py-2 pl-3 pr-3 text-left text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:bg-slate-100 disabled:text-slate-600`}
                      >
                        <SelectValue placeholder={adminLoading || loading ? "Loading staff…" : availableCandidates.length ? "Choose a staff member" : "No available staff"} />
                      </SelectTrigger>
                      <SelectContent align="start" className="w-[var(--radix-select-trigger-width)]">
                        {availableCandidates.map((candidate) => (
                          <SelectItem key={candidate.id} value={candidate.id} className="items-start break-all py-2 text-sm">
                            {candidate.full_name}
                            {candidate.email ? ` · ${candidate.email}` : ""}
                            {candidate.is_active === false ? " · Inactive" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="submit"
                    disabled={!assignmentAvailable || !availableCandidates.some((candidate) => candidate.id === selectedWaiterId)}
                    className={`${styles.control} h-auto max-w-full whitespace-normal text-base`}
                  >
                    {assigning && assigning === selectedWaiterId ? <Loader2 className="animate-spin" /> : <UserPlus />}
                    Assign waiter
                  </Button>
                </div>
                <p id={`${assignmentId}-hint`} className="mt-2 text-sm leading-relaxed text-slate-600">
                  {!adminLoading && candidates.length === 0
                    ? "Add a staff login in Users & roles to assign someone."
                    : "Assignment grants Waiter / Server access and reactivates inactive accounts."}
                </p>
              </>
            )}
          </form>
        )}
      </div>
    </CollapsibleSection>
  );
}
