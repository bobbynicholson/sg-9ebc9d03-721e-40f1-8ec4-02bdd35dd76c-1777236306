/**
 * /team-portal/cleaning/handovers/[id] - Wave 70.24 (Commit 3)
 *
 * Per-event handover detail page. Opens from a card on the
 * CleaningEventBoard. Shows:
 *
 *   - Event header (client, venue, date, expected return time)
 *   - Status + phase progression
 *   - Flat list of every cleaning_job linked to this handover
 *     (preserves the legacy per-item workflow as a power-user view)
 *   - "Mark all done" button to flip the handover to complete
 *   - Notes field for cleaner sign-off
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CheckCircle2, Package, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { BookingHeader } from "@/components/booking/BookingHeader";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { PortalShell } from "@/components/portal/ui";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Footer } from "@/components/Footer";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { supabase } from "@/integrations/supabase/client";
import {
  getHandoverDetail,
  completeHandover,
  type HandoverWithOrderMeta,
} from "@/services/cleaningHandoverService";
import { completeJob, startJob } from "@/services/cleaningJobsService";
import { equipmentTrackingService } from "@/services/equipmentTrackingService";
import { JobDamageButton } from "@/components/cleaning/JobDamageButton";

function fmtDateTime(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "--";
  return d.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

const PHASE_LABELS: Record<string, { label: string; tone: string }> = {
  expected:    { label: "Expected",    tone: "bg-amber-100 text-amber-800 border-amber-200" },
  in_progress: { label: "In progress", tone: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  complete:    { label: "Complete",    tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelled:   { label: "Cancelled",   tone: "bg-slate-100 text-slate-600 border-slate-200" },
};

const JOB_STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  queued:      { label: "Queued",      tone: "bg-slate-100 text-slate-700 border-slate-200" },
  in_progress: { label: "In progress", tone: "bg-blue-100 text-blue-800 border-blue-200" },
  complete:    { label: "Done",        tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelled:   { label: "Cancelled",   tone: "bg-rose-100 text-rose-700 border-rose-200" },
};

function HandoverDetailInner() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const handoverId = typeof router.query.id === "string" ? router.query.id : null;

  const [handover, setHandover] = useState<HandoverWithOrderMeta | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  // Damage flagged on this order, keyed by equipment_id, so each job row
  // can show "which item isn't fine" at a glance (count + types).
  const [damageByEq, setDamageByEq] = useState<Record<string, { qty: number; types: string[] }>>({});

  const load = async () => {
    if (!handoverId) return;
    setLoading(true);
    try {
      const { handover: h, jobs: j } = await getHandoverDetail(supabase as any, handoverId);
      setHandover(h);
      setJobs(j);
      if (h?.notes) setNotes(h.notes);
      // Pull any damage flagged on this order so the rows can surface it.
      if (h?.order_id) {
        try {
          const dmgs = await equipmentTrackingService.getDamages({ orderId: h.order_id });
          const map: Record<string, { qty: number; types: string[] }> = {};
          for (const d of (dmgs || []) as any[]) {
            const eid = d.equipment_id;
            if (!eid) continue;
            if (!map[eid]) map[eid] = { qty: 0, types: [] };
            map[eid].qty += Number(d.quantity_damaged || 0);
            const t = String(d.damage_type || "");
            if (t && !map[eid].types.includes(t)) map[eid].types.push(t);
          }
          setDamageByEq(map);
        } catch (dErr) {
          console.warn("[handovers/[id]] damage load failed (non-blocking):", dErr);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [handoverId]);

  const handleStartJob = async (jobId: string) => {
    setBusyJobId(jobId);
    const r = await startJob(supabase as any, jobId);
    setBusyJobId(null);
    if (!r.ok) {
      toast({ title: "Couldn't start", description: r.error, variant: "destructive" });
      return;
    }
    void load();
  };

  const handleCompleteJob = async (jobId: string) => {
    setBusyJobId(jobId);
    const r = await completeJob(supabase as any, jobId);
    setBusyJobId(null);
    if (!r.ok) {
      toast({ title: "Couldn't complete", description: r.error, variant: "destructive" });
      return;
    }
    // Dynamic clock-out: if that was the last active cleaning job for the
    // company, close this cleaner's open duty session automatically (mirror
    // of the driver autoClockOut). Best-effort - a clock-out miss must never
    // block the job tick. Scoped to the actor (userId) so a co-cleaner still
    // on the floor isn't pulled off duty.
    const companyId = (user as any)?.company_id || null;
    if (companyId && user?.id) {
      try {
        const { ended } = await equipmentTrackingService.autoEndCleaningDutyIfClear({
          companyId,
          userId: user.id,
        });
        if (ended > 0) {
          toast({
            title: "All cleaning done - clocked out",
            description: "The queue is clear, so your shift was closed automatically.",
          });
        }
      } catch (e) {
        console.warn("[handovers/[id]] auto clock-out failed (non-blocking):", e);
      }
    }
    void load();
  };

  const handleCompleteHandover = async () => {
    if (!handover) return;
    if (!confirm("Mark this entire handover complete? Any unfinished cleaning jobs stay open underneath.")) return;
    setCompleting(true);
    try {
      const totalReturned = jobs.reduce((sum, j) => sum + Number(j.quantity || 0), 0);
      const r = await completeHandover(supabase as any, handover.id, {
        totalReturned,
        notes: notes.trim() || undefined,
      });
      if (!r.ok) {
        toast({ title: "Couldn't complete", description: r.error, variant: "destructive" });
        return;
      }
      toast({ title: "Handover complete", description: "The event has been signed off." });

      // Cleaning persona follow-up (cleaning.md 5.2): notify kitchen
      // when post-return verification is signed off. Kitchen needs
      // this signal because returned equipment is now back in stock
      // and can be allocated to upcoming events. Previously the
      // signal lived only on the cleaning page; kitchen had to
      // refresh to discover that equipment counts had changed.
      try {
        const { notificationService } = await import("@/services/notificationService");
        await notificationService.broadcastNotification({
          companyId: (handover as any).company_id,
          targetRoles: ["kitchen_staff", "company_admin", "admin", "owner"] as any,
          title: "Cleaning handover complete",
          message: `Cleaning team signed off ${handover.order_number ? `order ${handover.order_number}` : "an event"}. ${totalReturned} item${totalReturned === 1 ? "" : "s"} verified - equipment is back in stock.`,
          type: "delivered" as any,
          priority: "normal",
          link: `/team-portal/cleaning/handovers/${handover.id}`,
          relatedEntityType: "cleaning_handover",
          relatedEntityId: handover.id,
          dedup: true,
          dedupWindowMinutes: 60,
        });
      } catch (notifErr) {
        console.warn("[handovers/[id]] kitchen notification failed:", notifErr);
      }

      void load();
    } finally {
      setCompleting(false);
    }
  };

  // Wave 70.41: eventLabel + the bespoke header band were folded
  // into the shared <BookingHeader variant="cleaning" /> below. The
  // header reads event_name / client_name from the booking prop
  // directly so we no longer maintain a local fallback string here.
  const phaseMeta = handover ? PHASE_LABELS[handover.status] : null;
  const allJobsDone = jobs.length > 0 && jobs.every((j) => j.status === "complete" || j.status === "cancelled");
  const canComplete = handover && handover.status !== "complete" && handover.status !== "cancelled";

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Cleaning handover {handover?.order_number || ""} - CateringMS</title>
      </Head>
      <CleaningNav />

      <main className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <Link
            href={withSlug("/team-portal/cleaning/dashboard")}
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Back to cleaning dashboard
          </Link>

          {loading ? (
            <Card><CardContent className="py-16 text-center text-slate-500">
              <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
              Loading handover...
            </CardContent></Card>
          ) : !handover ? (
            <Card><CardContent className="py-16 text-center text-slate-500">
              Handover not found.
            </CardContent></Card>
          ) : (
            <>
              {/* Wave 70.41 - canonical event-document header. The
                  previous bespoke header band rendered the same
                  client/date/venue/order_number facts every other
                  surface had to re-implement. Now: shared
                  <BookingHeader variant="cleaning"> with the tenant
                  brand gradient, role-aware framing ("Cleaning
                  handover" label, no money fields surfaced). Per-
                  handover lifecycle timestamps below the header are
                  cleaning-specific intelligence - they stay. */}
              <BookingHeader
                variant="cleaning"
                booking={{
                  id: handover.order_id ?? handover.id,
                  order_number: handover.order_number ?? null,
                  event_name: handover.event_name ?? null,
                  event_date: handover.event_date ?? null,
                  event_time: handover.event_time ?? null,
                  client_name: handover.client_name ?? null,
                  venue_address: handover.venue_address ?? null,
                  status: handover.status ?? null,
                }}
                rightSlot={
                  <div className="flex items-center gap-2">
                    {/* ODOC G.5: jump from a cleaning handover into
                        the source order doc - cleaner sees what was
                        served + when service finished + return
                        method etc. */}
                    {handover.order_id && (
                      <Link
                        href={withSlug(staffOrderHref(handover.order_id, "cleaning_staff"))}
                        className="inline-flex items-center gap-1 text-[11px] text-cyan-700 hover:text-cyan-900 hover:underline bg-cyan-50 border border-cyan-200 rounded px-2 py-0.5"
                        title="Open the source order"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View order
                      </Link>
                    )}
                    <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200 text-[11px] gap-1">
                      <Package className="w-3 h-3" />
                      {handover.total_items_expected} item{handover.total_items_expected === 1 ? "" : "s"}
                    </Badge>
                  </div>
                }
              />

              {/* Per-handover lifecycle timestamps - cleaning-specific
                  intelligence not modelled in the shared header. */}
              {(handover.expected_at || handover.in_progress_at || handover.completed_at) && (
                <Card className="border-0 shadow-sm mb-4">
                  <CardContent className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                    {handover.expected_at && handover.status === "expected" && (
                      <span className="text-amber-700">Expected back by {fmtDateTime(handover.expected_at)}</span>
                    )}
                    {handover.in_progress_at && (
                      <span className="text-cyan-700">Returned {fmtDateTime(handover.in_progress_at)}</span>
                    )}
                    {handover.completed_at && (
                      <span className="text-emerald-700">Signed off {fmtDateTime(handover.completed_at)}</span>
                    )}
                    {phaseMeta && (
                      <Badge variant="outline" className={`text-[10px] ml-auto ${phaseMeta.tone}`}>
                        {phaseMeta.label}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Cleaning jobs list */}
              <Card className="border-0 shadow-md mb-4">
                <CardHeader>
                  <CardTitle className="text-base">
                    Cleaning jobs ({jobs.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {jobs.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-6">
                      No cleaning jobs linked to this handover yet.
                      {handover.status === "expected" && " They'll appear once the order delivers."}
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {jobs.map((j) => {
                        const statusMeta = JOB_STATUS_LABEL[j.status] || JOB_STATUS_LABEL.queued;
                        const itemName = j.equipment_name || "(equipment)";
                        return (
                          <li key={j.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-slate-900">{itemName}</span>
                                <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                                  x{j.quantity}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] capitalize">
                                  {j.method}
                                </Badge>
                                <Badge variant="outline" className={`text-[10px] ${statusMeta.tone}`}>
                                  {statusMeta.label}
                                </Badge>
                                {damageByEq[j.equipment_id] && (
                                  <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200 gap-1">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    {damageByEq[j.equipment_id].qty} flagged ({damageByEq[j.equipment_id].types.join("/")})
                                  </Badge>
                                )}
                              </div>
                              {j.notes && (
                                <p className="text-[11px] text-slate-500 italic mt-1">{j.notes}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {/* Flag stays available on done jobs too - damage
                                  is usually found WHILE washing, i.e. right as
                                  the cleaner marks the item complete. */}
                              {j.equipment_id && (
                                <JobDamageButton
                                  equipmentId={j.equipment_id}
                                  equipmentName={itemName}
                                  orderId={handover.order_id}
                                  maxQuantity={Number(j.quantity || 1)}
                                  handoverId={handover.id}
                                  onFlagged={load}
                                />
                              )}
                              {j.status === "queued" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busyJobId === j.id}
                                  onClick={() => handleStartJob(j.id)}
                                  className="text-xs h-8"
                                >
                                  {busyJobId === j.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Start"}
                                </Button>
                              )}
                              {(j.status === "queued" || j.status === "in_progress") && (
                                <Button
                                  size="sm"
                                  disabled={busyJobId === j.id}
                                  onClick={() => handleCompleteJob(j.id)}
                                  className="bg-amber-600 hover:bg-amber-700 text-xs h-8 gap-1"
                                >
                                  {busyJobId === j.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                  Done
                                </Button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Sign-off */}
              {canComplete && (
                <Card className="border-0 shadow-md mb-4 border-l-4 border-l-emerald-500 bg-emerald-50/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">Sign off this handover</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Mark the event complete when all cleaning is done and equipment is back in storage. Records the count + any notes for the next cleaner.
                        </p>
                      </div>
                    </div>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional handover notes (e.g. 2 plates broken, 4 forks missing - check next event)"
                      className="text-sm bg-white"
                      rows={2}
                    />
                    {!allJobsDone && jobs.length > 0 && (
                      <p className="text-[11px] text-amber-700 inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {jobs.filter((j) => j.status !== "complete" && j.status !== "cancelled").length} job{jobs.filter((j) => j.status !== "complete" && j.status !== "cancelled").length === 1 ? "" : "s"} still open. Force-complete will leave them as is.
                      </p>
                    )}
                    <div className="flex justify-end">
                      <Button
                        onClick={handleCompleteHandover}
                        disabled={completing}
                        className="bg-amber-600 hover:bg-amber-700 gap-1.5"
                      >
                        {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        {completing ? "Signing off..." : "Mark handover complete"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </PortalShell>
        <Footer />
      </main>
    </>
  );
}

export default function ProtectedHandoverDetailPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.CLEANING_STAFF]}>
      <HandoverDetailInner />
    </ProtectedRoute>
  );
}
