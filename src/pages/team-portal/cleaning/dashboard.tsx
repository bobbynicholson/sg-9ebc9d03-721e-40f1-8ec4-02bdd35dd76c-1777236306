import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SprayCan, ClipboardCheck, AlertTriangle, CheckCircle, Truck, Clock, Package, Printer, Loader2, Camera, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { captureException } from "@/lib/observability";
import { useToast } from "@/hooks/use-toast";
import { PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";
import { CleaningPageShell, CLEANING_HERO_CHIP } from "@/components/cleaning/CleaningPageShell";
import { CleaningDutyWidget } from "@/components/cleaning/CleaningDutyWidget";
import { CleaningJobsQueue } from "@/components/cleaning/CleaningJobsQueue";
import { CleaningEventBoard } from "@/components/cleaning/CleaningEventBoard";
import { PreEventCleanlinessPanel } from "@/components/cleaning/PreEventCleanlinessPanel";
import { EquipmentVerificationPanel } from "@/components/cleaning/EquipmentVerificationPanel";
import { DamageFlagForm } from "@/components/cleaning/DamageFlagForm";
import { RecentDamagesStrip } from "@/components/cleaning/RecentDamagesStrip";
import { unitsInActiveCleaning } from "@/services/cleaningJobsService";
import { useAuth } from "@/contexts/AuthContext";
import { useOrderRefreshSignal } from "@/hooks/useOrderRefreshSignal";
import { ChatBot } from "@/components/ChatBot";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { reporterNameFromUser } from "@/lib/damageReporter";

type EquipmentStatus = "available" | "in_use" | "cleaning" | "damaged";

interface EquipmentRow {
  id: string;
  name: string;
  status: EquipmentStatus;
  quantity: number;
  available_quantity: number;
}

function CleaningDashboardInner() {
  const { user } = useAuth();
  const router = useRouter();
  const canManageCleaning = [
    UserRole.CLEANING_MANAGER,
    UserRole.CLEANING_STAFF,
    UserRole.COMPANY_ADMIN,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  ].includes(user?.role as UserRole);
  // TIGHTEN I.119 (2026-06-02): refetch when an order edit lands in any tab.
  const refreshSignal = useOrderRefreshSignal(user?.company_id ?? null);
  const [activeTab, setActiveTab] = useState("verification");
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [loadingEquipment, setLoadingEquipment] = useState(true);
  // Command-centre restructure (2026-07-02): the equipment read used to
  // console.error and quietly render an empty (all-zero) board on
  // failure. Failures now land here and paint a rose recovery card with
  // a Retry that re-runs the loader. `loaded` gates the hero chips so
  // counts only show once real data has arrived; the ref mirrors it so
  // the loader itself doesn't need `loaded` in its dependency list
  // (which would re-create the realtime subscription).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const hasLoadedRef = useRef(false);
  const { toast } = useToast();

  // CLN-B (XSC Wave B): Inspect button state. Pre-audit the Inspect
  // button was a placeholder with no onClick - the cleaner's
  // completion loop was broken at the actual completion step.
  // The dialog opens a 5-item SOP checklist, an optional notes
  // field, an optional photo (input field only - upload to storage
  // is a follow-up), and either a Complete or Report damage action.
  // Complete flips equipment.condition to 'good' and stamps
  // available_quantity back to the full quantity. Damage opens
  // the existing damage flow (equipmentTrackingService.reportDamage).
  const [inspectItem, setInspectItem] = useState<EquipmentRow | null>(null);
  const [sopChecks, setSopChecks] = useState({
    debrisRemoved: false,
    sanitised: false,
    dried: false,
    storedCorrectly: false,
    noDamage: false,
  });
  const [inspectNotes, setInspectNotes] = useState("");
  const [damageFound, setDamageFound] = useState(false);
  const [inspectSaving, setInspectSaving] = useState(false);

  const openInspect = (item: EquipmentRow) => {
    setInspectItem(item);
    setSopChecks({ debrisRemoved: false, sanitised: false, dried: false, storedCorrectly: false, noDamage: false });
    setInspectNotes("");
    setDamageFound(false);
  };
  const closeInspect = () => {
    setInspectItem(null);
    setInspectNotes("");
    setDamageFound(false);
  };

  const allCleanChecks = sopChecks.debrisRemoved && sopChecks.sanitised && sopChecks.dried && sopChecks.storedCorrectly;
  const canComplete = damageFound
    ? true  // damage path doesn't require SOP checks
    : allCleanChecks && sopChecks.noDamage;

  const submitInspect = async () => {
    if (!inspectItem || !user?.id || !user?.company_id) return;
    setInspectSaving(true);
    try {
      if (damageFound) {
        // CLN-B: route to the existing damage reporting service so
        // every damages row carries the canonical (company_id,
        // equipment_id, reporter, stage) shape and surfaces on the
        // /admin damages tab automatically.
        const { equipmentTrackingService } = await import("@/services/equipmentTrackingService");
        await (equipmentTrackingService as any).reportDamage({
          companyId: user.company_id,
          equipmentId: inspectItem.id,
          quantityDamaged: 1,
          damageType: "damaged",
          damageStage: "cleaning",
          unitCost: 0,
          responsibleUserId: user.id,
          responsibleName: reporterNameFromUser(user),
          notes: inspectNotes || "Damage spotted during cleaning inspection",
          description: inspectNotes || "Damage spotted during cleaning inspection",
        });
        await supabase
          .from("equipment")
          .update({ condition: "damaged" })
          .eq("id", inspectItem.id)
          .eq("company_id", user.company_id);
        toast({ title: "Damage reported", description: `${inspectItem.name} flagged for repair` });
      } else {
        // CLN-B: clean completion. Flip equipment.condition to 'good'
        // and lift available_quantity back to the full owned quantity.
        // The realtime sub on the dashboard will refresh the list.
        const { error } = await supabase
          .from("equipment")
          .update({
            condition: "good",
            available_quantity: inspectItem.quantity,
          } as never)
          .eq("id", inspectItem.id)
          .eq("company_id", user.company_id);
        if (error) throw error;
        toast({ title: "Inspection complete", description: `${inspectItem.name} marked clean and available` });
      }
      closeInspect();
      loadEquipment();
    } catch (e: any) {
      captureException(e, { tags: { route: "/team-portal/cleaning/dashboard", step: "submitInspect", companyId: user.company_id, equipmentId: inspectItem.id } });
      toast({ title: "Could not save inspection", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setInspectSaving(false);
    }
  };

  // Wave 70.28 - the new cleaning nav deep-links to #returns and
  // #washing on this page. Next.js handles hash navigation but the
  // initial paint can race the scroll, so re-scroll after a short
  // delay to make sure the anchor target is in view.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = router.asPath.split("#")[1];
    if (!hash) return;
    const scroll = () => {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    // Two passes - first immediate, second after data has settled.
    scroll();
    const t = setTimeout(scroll, 400);
    return () => clearTimeout(t);
  }, [router.asPath]);

  // CLN2-E (cleaning deep audit, CLN2-13): extracted to useCallback so
  // the realtime sub effect can re-call it on cleaning_jobs / equipment
  // changes. Pre-fix the load fired once on mount + relied on tab
  // switches to refresh; a colleague moving a teapot from broken to
  // available stayed invisible to other devices.
  const loadEquipment = useCallback(async () => {
    if (!user?.company_id) return;
    // Skeleton only before the first successful load; realtime-driven
    // refreshes swap the data in place without blanking the board.
    if (!hasLoadedRef.current) setLoadingEquipment(true);
    try {
      const { data: equipmentData, error: equipmentErr } = await supabase
        .from("equipment")
        .select("id, name, condition, quantity, available_quantity")
        .eq("company_id", user.company_id);
      if (equipmentErr) throw equipmentErr;

      // Wave 41 Phase 2: cleaning_jobs is now the source of truth
      // for "what's currently being cleaned" (units, not just a
      // boolean flag on the equipment). Falls back gracefully if
      // the company hasn't started using cleaning_jobs yet - the
      // map will simply be empty.
      const cleaningUnitsMap = await unitsInActiveCleaning(supabase as any, user.company_id);

      const rows: EquipmentRow[] = (equipmentData || []).map((eq: any) => {
        const inCleaning = cleaningUnitsMap.get(eq.id) || 0;
        // Subtract active-cleaning units from nominal availability
        // so the operator sees what's truly available right now.
        const trueAvailable = Math.max(0, (eq.available_quantity ?? 0) - inCleaning);
        let status: EquipmentStatus;
        if (eq.condition === "damaged" || eq.condition === "broken") {
          status = "damaged";
        } else if (inCleaning > 0) {
          status = "cleaning";
        } else if (trueAvailable < (eq.quantity ?? 0)) {
          status = "in_use";
        } else {
          status = "available";
        }
        return {
          id: eq.id,
          name: eq.name,
          status,
          quantity: eq.quantity ?? 0,
          available_quantity: trueAvailable,
        };
      });

      setEquipment(rows);
      setLoadError(null);
      hasLoadedRef.current = true;
      setLoaded(true);
    } catch (e: any) {
      captureException(e, { tags: { route: "/team-portal/cleaning/dashboard", step: "loadEquipment", companyId: user.company_id } });
      // Keep any last-good rows on screen; never dress a failed read
      // up as an all-clear empty board.
      setLoadError(e?.message || "We couldn't load the equipment board. Check your connection and retry.");
    } finally {
      setLoadingEquipment(false);
    }
  }, [user?.company_id]);

  useEffect(() => {
    if (!user?.company_id) return;
    void loadEquipment();
  }, [user?.company_id, loadEquipment, refreshSignal]);

  // CLN2-E (CLN2-13): supabase realtime sub on cleaning_jobs +
  // equipment. The cleaning lead in the prep room updates a job;
  // the dispatcher's screen on the wall refreshes within seconds.
  //
  // Visibility-aware throttling: when the tab is hidden, we only
  // queue a single deferred refresh and let it fire on visibility
  // change. Multi-device usage on the catering floor (back-room
  // tablet + walking lead's phone) doesn't need the hidden tab
  // burning CPU on every channel event.
  useEffect(() => {
    if (!user?.company_id) return;
    let pendingWhileHidden = false;
    const refresh = () => {
      if (document.hidden) {
        pendingWhileHidden = true;
        return;
      }
      void loadEquipment();
    };
    const onVisibility = () => {
      if (!document.hidden && pendingWhileHidden) {
        pendingWhileHidden = false;
        void loadEquipment();
      }
    };
    // Unique per-mount suffix: a fixed channel name collides when the
    // page remounts fast (recurring realtime bug class in this repo).
    const sub = supabase
      .channel(`cleaning-dashboard-${user.company_id}-${Math.random().toString(36).slice(2)}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "*", schema: "public", table: "cleaning_jobs",
        filter: `company_id=eq.${user.company_id}`,
      }, refresh)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "*", schema: "public", table: "equipment",
        filter: `company_id=eq.${user.company_id}`,
      }, refresh)
      .subscribe();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      // removeChannel (not bare unsubscribe) so the client also drops
      // the channel from its registry - the recurring-bug-class rule
      // for every non-presence realtime subscription.
      void supabase.removeChannel(sub);
    };
  }, [user?.company_id, loadEquipment]);

  // Hero chip counts. chipsReady gates them behind the first clean
  // load so the hero never shows zeros for data that simply failed.
  const availableCount = equipment.filter((e) => e.status === "available").length;
  const cleaningCount = equipment.filter((e) => e.status === "cleaning").length;
  const damagedCount = equipment.filter((e) => e.status === "damaged").length;
  const chipsReady = loaded && !loadError;

  return (
    <>
      <CleaningPageShell
        pageTitle="Cleaning dashboard - CateringMS"
        heading="Cleaning desk"
        subheading="Returns, washing queue, priority inspections, damages, and what is ready to send out again."
        icon={SprayCan}
        headerAction={
          /* CLN2-J (cleaning deep audit, CLN2-19): paper roster. The
             cleaning lead handing off to a fresh shift wants a
             printed checklist - equipment categories + today's
             cleaning jobs grouped by status. Same recipe as DRV-J /
             KIT2-N / SHP2-A. */
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (equipment.length === 0) {
                // No data to print - cheap feedback rather than
                // a blank A4 surprise.
                toast({
                  title: "Equipment still loading",
                  description: "Wait a moment, then print the roster again.",
                  variant: "destructive",
                });
                return;
              }
              setTimeout(() => window.print(), 100);
            }}
          >
            <Printer className="w-4 h-4 mr-2" />
            Print roster
          </Button>
        }
        meta={
          chipsReady ? (
            <>
              <span className={CLEANING_HERO_CHIP}>
                <CheckCircle className="h-3 w-3" />
                {availableCount} ready to send out
              </span>
              <span className={CLEANING_HERO_CHIP}>
                <Clock className="h-3 w-3" />
                {cleaningCount} in cleaning
              </span>
              {damagedCount > 0 && (
                <span className={CLEANING_HERO_CHIP}>
                  <AlertTriangle className="h-3 w-3" />
                  {damagedCount} damaged
                </span>
              )}
            </>
          ) : undefined
        }
      >
          {/* Recovery card: the equipment read failed. Keep any
              last-good board below, but never dress a failure up as
              an all-clear day. */}
          {loadError && (
            <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40">
              <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Couldn&apos;t load the equipment board</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{loadError}</p>
              <Button
                size="sm"
                onClick={() => void loadEquipment()}
                disabled={loadingEquipment}
                className="bg-brand-primary hover:opacity-90 text-white"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingEquipment ? "animate-spin motion-reduce:animate-none" : ""}`} />
                Retry
              </Button>
            </div>
          )}

          {/* Wave 39: live duty + clock-in surface. Component existed
              but was imported and never rendered. Wave 39 also fixed
              4 stacked bugs in the widget itself (company_id scoped
              wrong, missing schema columns added via migration). */}
          {canManageCleaning && (
            <div id="duty" className="scroll-mt-20 lg:scroll-mt-6">
              <CleaningDutyWidget />
            </div>
          )}

          {/* CLN2-F (cleaning deep audit, CLN2-15): pre-event
              cleanliness checklist for tomorrow's events. The
              formal closure of the cleaning to kitchen-readiness
              loop that KIT2-O's chip was a v1 stand-in for. Mobile
              first - accordion strip per event so a 6-event day
              doesn't render a 30-cell table on a tablet. */}
          {canManageCleaning ? (
            <PreEventCleanlinessPanel />
          ) : (
            <PortalCard className="border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Cleaning status is read-only here</p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                Kitchen can monitor returns and readiness. Cleaning clock-in, washing, verification, and damage updates stay with the cleaning team.
              </p>
            </PortalCard>
          )}

          {/* Wave 70.24 - new event-grouped board is the primary
              cleaning surface. Shows expected handovers (anticipation),
              in-progress (active work), done-today (throughput).
              Tap a card to open the per-event detail.
              Wave 70.28 - id="returns" is the deep-link target from
              the cleaning nav "Returns" item + live state strip. */}
          <div id="returns" className="scroll-mt-20 lg:scroll-mt-6">
            <CleaningEventBoard />
          </div>

          {/* Wave 41 Phase 2: equipment-availability ledger. Lists
              every active cleaning_jobs row with method chip + ETA
              back into inventory + start/complete actions. Kept as
              the flat-by-item power-user fallback below the new
              event-grouped board.
              Wave 70.28 - id="washing" is the deep-link target from
              the cleaning nav "Washing" item + live state strip. */}
          {canManageCleaning && (
            <div id="washing" className="scroll-mt-20 lg:scroll-mt-6">
              <CleaningJobsQueue />
            </div>
          )}

          {/* Tile row hides on a failed first load - all-zero tiles
              over a broken read would tell the lead a lie. */}
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8 ${loadError && !loaded ? "hidden" : ""}`}>
            <StatTile
              icon={CheckCircle}
              label="Available"
              value={equipment.filter(e => e.status === 'available').length}
              hint="Clean and ready to send out"
            />
            <StatTile
              icon={Truck}
              label="In Use"
              value={equipment.filter(e => e.status === 'in_use').length}
              hint="Currently out on a job"
            />
            <StatTile
              icon={Clock}
              label="Cleaning"
              value={equipment.filter(e => e.status === 'cleaning').length}
              hint="Waiting in the cleaning queue"
            />
            <StatTile
              icon={AlertTriangle}
              label="Damaged"
              value={equipment.filter(e => e.status === 'damaged').length}
              hint="Out of rotation until repaired"
            />
          </div>

          <PortalCard className="mb-6 sm:mb-8">
            <PortalCardHeader title="Today's priority inspections" />
            <div className="space-y-3">
              {loadingEquipment ? (
                // Skeleton rows so the layout doesn't jump when data lands.
                <div className="space-y-2" aria-busy="true" aria-label="Loading equipment">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-16 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 animate-pulse" />
                  ))}
                </div>
              ) : loadError && equipment.length === 0 ? (
                // The recovery card above owns this state; keep the
                // card body quiet instead of celebrating a false
                // "all inspections complete".
                <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  Equipment is unavailable right now. Use Retry above to reload it.
                </div>
              ) : (
                <>
                  {equipment
                    .filter(e => e.status === 'cleaning' || e.status === 'damaged')
                    .slice(0, 5)
                    .map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                        <div className="flex items-center gap-3 min-w-0">
                          <Package className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">{item.name}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                              {item.available_quantity} of {item.quantity} available
                            </p>
                          </div>
                        </div>
                        {canManageCleaning && (
                          <Button size="sm" variant="outline" onClick={() => openInspect(item)} className="flex-shrink-0">
                            Inspect
                          </Button>
                        )}
                      </div>
                    ))}
                  {equipment.filter(e => e.status === 'cleaning' || e.status === 'damaged').length === 0 && (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                      <CheckCircle className="w-12 h-12 mx-auto mb-2 text-brand-primary dark:text-brand-primary" />
                      <p>All equipment inspections complete for today!</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </PortalCard>

          {/* Wave 42 Tier 2: dropped the "Cleaning Workflow" tab.
              The CleaningJobsQueue mounted at the top of the page is
              now the canonical surface for live cleaning state, with
              one source of truth (cleaning_jobs). The legacy
              CleaningWorkflowTracker (pending->cleaning->drying->ready
              over equipment_cleaning_status) was contradicting it --
              cleaners completed jobs in one place and admins still
              saw them pending elsewhere. Component file kept in case
              another surface needs it later. */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <TabsTrigger
                value="verification"
                className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                <ClipboardCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Equipment Verification</span>
                <span className="sm:hidden">Verify</span>
              </TabsTrigger>
              <TabsTrigger
                value="damages"
                className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                <AlertTriangle className="h-4 w-4" />
                <span className="hidden sm:inline">Damages & Losses</span>
                <span className="sm:hidden">Damages</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="verification" className="space-y-6">
              <PortalCard>
                <div className="mb-4 flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Equipment verification</h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 -mt-2 mb-4">
                  Verify returned equipment from functions and report any damages or losses
                </p>
                {canManageCleaning ? (
                  <EquipmentVerificationPanel />
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Cleaning verification is handled by the cleaning team. Kitchen can use the return board above for readiness.
                  </p>
                )}
              </PortalCard>
            </TabsContent>

            <TabsContent value="damages" className="space-y-6">
              <PortalCard>
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-rose-500 dark:text-rose-400" />
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Flag damaged equipment</h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 -mt-2 mb-4">
                  {canManageCleaning
                    ? "Mark broken, lost, or damaged items. Cost breakdown lives on /admin/equipment."
                    : "Damage reports are read-only for kitchen roles. Ask cleaning or admin to update the damage log."}
                </p>
                {/* CLN2-I: cleaner gets a tight flag-form + recent
                    strip only. Cost analytics moved to admin. */}
                <div className="space-y-4">
                  {canManageCleaning && <DamageFlagForm />}
                  <RecentDamagesStrip />
                </div>
              </PortalCard>
            </TabsContent>

          </Tabs>

          <PortalCard className="mt-6">
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                  <ClipboardCheck className="h-3 w-3 mr-1 text-slate-400 dark:text-slate-500" />
                  Verification
                </Badge>
                <span className="text-slate-500 dark:text-slate-400">Check returned equipment</span>
              </div>
              <div className="hidden sm:block h-4 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                  <Clock className="h-3 w-3 mr-1 text-slate-400 dark:text-slate-500" />
                  Cleaning queue
                </Badge>
                <span className="text-slate-500 dark:text-slate-400">Live wash + dishwasher status</span>
              </div>
              <div className="hidden sm:block h-4 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                  <AlertTriangle className="h-3 w-3 mr-1 text-slate-400 dark:text-slate-500" />
                  Damages
                </Badge>
                <span className="text-slate-500 dark:text-slate-400">Monitor costs</span>
              </div>
            </div>
          </PortalCard>
      </CleaningPageShell>

      <ChatBot userRole="cleaning" companyId={user?.company_id} />

      {/* CLN2-J (cleaning deep audit, CLN2-19): print-only roster.
          Hidden on screen via the print CSS below. Three blocks:
          equipment by status (available / in_use / cleaning /
          damaged), today's cleaning jobs grouped by status, and a
          tick-off section the lead can use during the floor walk
          for the next shift handover. */}
      <div id="print-cleaning-roster" className="print-only">
        <h1 style={{ fontSize: "20pt", marginBottom: "4pt", fontFamily: "sans-serif" }}>
          Cleaning roster
        </h1>
        <p style={{ fontSize: "10pt", color: "#475569", marginBottom: "14pt", fontFamily: "sans-serif" }}>
          {new Date().toLocaleString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          {" - "}
          {equipment.length} equipment row{equipment.length === 1 ? "" : "s"} tracked
        </p>

        {/* Equipment status table */}
        <h2 style={{ fontSize: "13pt", marginTop: "8pt", marginBottom: "6pt", fontFamily: "sans-serif", borderBottom: "1pt solid #0f172a", paddingBottom: "2pt" }}>
          Equipment status
        </h2>
        {(() => {
          const grouped: Record<string, EquipmentRow[]> = {
            damaged: [],
            cleaning: [],
            in_use: [],
            available: [],
          };
          for (const eq of equipment) grouped[eq.status]?.push(eq);
          const sectionLabels: Array<{ key: EquipmentStatus; label: string; tone: string }> = [
            { key: "damaged",  label: "Damaged - needs attention",     tone: "#dc2626" },
            { key: "cleaning", label: "Currently in cleaning",          tone: "#0891b2" },
            { key: "in_use",   label: "In use",                         tone: "#b45309" },
            { key: "available",label: "Available",                      tone: "#15803d" },
          ];
          return sectionLabels.map((sec) => {
            const items = grouped[sec.key] || [];
            if (items.length === 0) return null;
            return (
              <div key={sec.key} style={{ marginBottom: "10pt", pageBreakInside: "avoid" }}>
                <p style={{ fontSize: "11pt", fontWeight: 700, marginBottom: "3pt", color: sec.tone, fontFamily: "sans-serif" }}>
                  {sec.label} ({items.length})
                </p>
                <ul style={{ margin: 0, paddingLeft: "16pt", fontSize: "9.5pt", color: "#0f172a", fontFamily: "sans-serif" }}>
                  {items.map((eq) => (
                    <li key={eq.id} style={{ marginBottom: "2pt" }}>
                      <strong>{eq.name}</strong>
                      <span style={{ color: "#64748b" }}> - {eq.available_quantity} of {eq.quantity} available</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          });
        })()}

        {/* Tick-off floor walk - the lead can pace the kitchen and
            tick each station off in person before handover. */}
        <h2 style={{ fontSize: "13pt", marginTop: "16pt", marginBottom: "6pt", fontFamily: "sans-serif", borderBottom: "1pt solid #0f172a", paddingBottom: "2pt" }}>
          Floor-walk checklist
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt", fontFamily: "sans-serif" }}>
          <tbody>
            {[
              "Surfaces wiped",
              "Sinks cleared",
              "Bins emptied",
              "Floor mopped",
              "Fridge spot-checked",
              "Equipment trolley returned",
              "Shift notes left for next lead",
            ].map((task) => (
              <tr key={task} style={{ borderBottom: "0.5pt solid #cbd5e1", pageBreakInside: "avoid" }}>
                <td style={{ width: "22pt", padding: "6pt 4pt" }}>
                  <span style={{ display: "inline-block", width: "14pt", height: "14pt", border: "1.5pt solid #0f172a", verticalAlign: "middle" }} />
                </td>
                <td style={{ padding: "6pt 4pt" }}>{task}</td>
                <td style={{ padding: "6pt 4pt", textAlign: "right", color: "#64748b" }}>By: ______________</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ marginTop: "20pt", fontSize: "9pt", color: "#64748b", fontFamily: "sans-serif" }}>
          Generated {new Date().toLocaleString("en-ZA")} from CateringMS Cleaning Portal
        </p>
      </div>

      <style jsx global>{`
        @media print {
          @page { margin: 12mm; }
          body * { visibility: hidden !important; }
          #print-cleaning-roster, #print-cleaning-roster * { visibility: visible !important; }
          #print-cleaning-roster {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
          }
        }
        @media not print {
          .print-only { display: none !important; }
        }
      `}</style>

      {/* CLN-B: Inspect / completion dialog. Two paths: clean
          + mark-available (requires all SOP checks), or report
          damage (routes through equipmentTrackingService.reportDamage
          for the admin damages tab). */}
      <Dialog open={canManageCleaning && !!inspectItem} onOpenChange={(o) => { if (!o) closeInspect(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-brand-primary" />
              Inspect {inspectItem?.name}
            </DialogTitle>
            <DialogDescription>
              Walk through the checklist before marking this item clean and available.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {!damageFound && (
              <div className="space-y-2 border rounded-md p-3 bg-slate-50/60">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Cleaning checklist</p>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={sopChecks.debrisRemoved} onCheckedChange={(v) => setSopChecks((s) => ({ ...s, debrisRemoved: !!v }))} />
                  <span>Visible debris removed</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={sopChecks.sanitised} onCheckedChange={(v) => setSopChecks((s) => ({ ...s, sanitised: !!v }))} />
                  <span>Sanitised with approved cleaner</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={sopChecks.dried} onCheckedChange={(v) => setSopChecks((s) => ({ ...s, dried: !!v }))} />
                  <span>Fully dried (no standing water)</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={sopChecks.storedCorrectly} onCheckedChange={(v) => setSopChecks((s) => ({ ...s, storedCorrectly: !!v }))} />
                  <span>Stored in correct location</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={sopChecks.noDamage} onCheckedChange={(v) => setSopChecks((s) => ({ ...s, noDamage: !!v }))} />
                  <span>No damage spotted</span>
                </label>
              </div>
            )}

            <label className="flex items-start gap-2 text-sm border rounded-md p-3 bg-amber-50/60 border-amber-200">
              <Checkbox checked={damageFound} onCheckedChange={(v) => setDamageFound(!!v)} />
              <div>
                <span className="font-medium text-amber-900">Damage found</span>
                <p className="text-xs text-amber-800 mt-0.5">Flag this item for repair and route to the admin damages tab.</p>
              </div>
            </label>

            <div>
              <Label htmlFor="inspect-notes" className="text-xs">Notes (optional)</Label>
              <Textarea
                id="inspect-notes"
                value={inspectNotes}
                onChange={(e) => setInspectNotes(e.target.value)}
                rows={2}
                placeholder={damageFound ? "Describe the damage" : "Anything the next shift should know"}
              />
            </div>

            {/* CLN-B: photo capture input - file ref only for now.
                Storage upload is a deliberate follow-up to keep this
                fix surgical. The input still gives the cleaner the
                muscle memory + signals where the photo will land. */}
            <div className="flex items-center gap-2 text-xs text-slate-600 border-dashed border rounded-md p-2.5">
              <Camera className="w-4 h-4 text-slate-400" />
              <label className="cursor-pointer flex-1">
                <input type="file" accept="image/*" capture="environment" className="hidden" />
                <span className="text-slate-700">Take a photo (optional)</span>
                <p className="text-[10px] text-slate-500 mt-0.5">Photo upload to storage coming in a follow-up.</p>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeInspect} disabled={inspectSaving}>Cancel</Button>
            <Button
              onClick={submitInspect}
              disabled={inspectSaving || !canComplete}
              className={damageFound ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-primary hover:bg-brand-primary/90"}
            >
              {inspectSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving</> :
                damageFound ? "Report damage" : "Mark clean and available"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Wave 41 (CRITICAL FIX): wrap in ProtectedRoute. The page was
 * previously reachable by any authenticated user - a kitchen_staff
 * (or driver, or anyone with a session) could hit
 * /team-portal/cleaning/dashboard and clock in as a cleaner via the
 * embedded CleaningDutyWidget. Restrict to cleaning + admin roles.
 */
/**
 * Wave 41 Phase 2 - the dashboard now reads from cleaning_jobs
 * (the new equipment-availability ledger) for the "Cleaning" tile
 * and subtracts active-job units from "Available". Brings the
 * overview into line with what the new CleaningJobsQueue surface
 * shows the team.
 */
// CLN2-C (cleaning deep audit, CLN2-33, P0): KITCHEN_STAFF added.
// PR #115 KIT2-A added a "Cleaning schedule" CTA on the kitchen
// dashboard header that links here - per Bobby's "kitchen should
// see cleaning schedule" directive. Before this fix, the
// ProtectedRoute wrapper bounced kitchen leads out of their own
// CTA. Write actions are still gated per-component (CleaningDuty
// widget Start-duty button etc) so a kitchen lead reading this
// page can't accidentally clock in as a cleaner.
export default function CleaningDashboard() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.CLEANING_MANAGER,
        UserRole.CLEANING_STAFF,
        UserRole.KITCHEN_MANAGER,
        UserRole.KITCHEN_STAFF,
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.REGION_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <CleaningDashboardInner />
    </ProtectedRoute>
  );
}
