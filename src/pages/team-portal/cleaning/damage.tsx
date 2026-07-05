import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Plus, Loader2, Search, Check, FileWarning, Package, Calendar as CalendarIcon, User, Image as ImageIcon, RefreshCw } from "lucide-react";
import { CleaningPageShell, CLEANING_HERO_CHIP } from "@/components/cleaning/CleaningPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalCard, StatTile } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { notificationService } from "@/services/notificationService";
import { formatDistanceToNow } from "date-fns";
import { damageReporterName, damageReporterRole, reporterNameFromUser, type DamageReporterProfile } from "@/lib/damageReporter";
import { formatZAR } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/app";

interface Damage {
  id: string;
  damage_type: string | null;
  notes: string | null;
  repair_cost: number | null;
  resolved: boolean | null;
  reported_by: string | null;
  order_id: string | null;
  equipment_id: string | null;
  created_at: string | null;
  // Richer fields written by the Flag-damaged flow (reportDamage). The
  // legacy create dialog on this page writes notes/repair_cost; the cleaner
  // Flag button writes description/total_cost/quantity_damaged/photo. We read
  // both so every damage shows fully regardless of which path created it.
  description: string | null;
  total_cost: number | null;
  unit_cost: number | null;
  quantity_damaged: number | null;
  photo_url: string | null;
  responsible_name: string | null;
  damage_stage: string | null;
  reporter?: DamageReporterProfile | null;
  // Event + client context (joined) so a damage reads as a billable line:
  // "broken bowl on ORD-003849, Smith Wedding, client Jane - charge R10".
  order: {
    order_number: string | null;
    event_name: string | null;
    client_name: string | null;
    event_date: string | null;
  } | null;
}

// Unified accessors so legacy (notes/repair_cost) and new (description/
// total_cost) damage rows render identically.
const damageDescription = (d: Damage): string => (d.description || d.notes || "").trim();
const damageCost = (d: Damage): number => Number(d.total_cost ?? d.repair_cost ?? 0);
const damageQty = (d: Damage): number => Number(d.quantity_damaged ?? 1);

interface Equipment { id: string; name: string | null; replacement_cost: number | null; }

const typeTone: Record<string, string> = {
  damage:     "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  damaged:    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  missing:    "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
  lost:       "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
  stolen:     "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
  broken:     "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
  worn:       "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  cosmetic:   "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

function CleaningDamagePageInner() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Two windows, one load: latest 100 damages (any state) plus the latest
  // 100 unresolved ones, merged below. The second query keeps an old open
  // report visible even after 100 newer resolved rows push it out of the
  // first window, so the Open tab, the chips and the tiles all agree.
  // Tabs are client-side filters over the merge (no refetch per toggle).
  const [rows, setRows] = useState<Damage[]>([]);
  const [openRows, setOpenRows] = useState<Damage[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "open" | "resolved">("open");

  const [creating, setCreating] = useState(false);
  const [equipmentId, setEquipmentId] = useState("");
  const [damageType, setDamageType] = useState("damage");
  const [notes, setNotes] = useState("");
  const [repairCost, setRepairCost] = useState("");
  const [saving, setSaving] = useState(false);
  // Resolve writes in flight, so the button can't double-fire per row.
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.company_id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  useEffect(() => {
    if (!user?.company_id) return;
    const refresh = () => void load();
    // Unique per-mount suffix: a fixed channel name collides when the
    // page remounts fast (recurring realtime bug class in this repo).
    const channel = supabase
      .channel(`cleaning-damage-${user.company_id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_damages", filter: `company_id=eq.${user.company_id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment", filter: `company_id=eq.${user.company_id}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    const companyId = user.company_id;
    // Skeleton only before the first successful load; realtime refreshes
    // swap the data in place without blanking the ledger.
    if (!loaded) setLoading(true);
    try {
      const base = () =>
        supabase
          .from("equipment_damages")
          .select("*, order:order_id(order_number, event_name, client_name, event_date)")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(100);
      const [allRes, openRes] = await Promise.all([
        base().returns<Damage[]>(),
        base().eq("resolved", false).returns<Damage[]>(),
      ]);
      if (allRes.error) throw allRes.error;
      if (openRes.error) throw openRes.error;
      const allRows = allRes.data || [];
      const unresolvedRows = openRes.data || [];

      const reporterIds = Array.from(new Set(
        [...allRows, ...unresolvedRows].map((d) => d.reported_by).filter((id): id is string => Boolean(id)),
      ));
      let reportersById = new Map<string, DamageReporterProfile>();
      if (reporterIds.length > 0) {
        const { data: reporterRows, error: reporterError } = await supabase
          .from("profiles")
          .select("id, full_name, email, role, active_role")
          .in("id", reporterIds);
        if (!reporterError) {
          reportersById = new Map(
            ((reporterRows || []) as Array<DamageReporterProfile & { id: string }>).map((p) => [p.id, p]),
          );
        }
      }
      const withReporter = (list: Damage[]) => list.map((d) => ({
        ...d,
        reporter: d.reported_by ? reportersById.get(d.reported_by) || null : null,
      }));
      setRows(withReporter(allRows));
      setOpenRows(withReporter(unresolvedRows));

      // Equipment names are secondary context (picker + row chips); a
      // failure here shouldn't block the ledger itself.
      const { data: eqs } = await supabase
        .from("equipment")
        .select("id, name, replacement_cost")
        .eq("company_id", companyId)
        .order("name", { ascending: true })
        .returns<Equipment[]>();
      setEquipment(eqs || []);
      setLoadError(null);
      setLoaded(true);
    } catch (e: any) {
      // Recovery card owns this state; never show "no damage reports"
      // for a failed load.
      setLoadError(e?.message || "We couldn't reach the server. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  // Merge the two windows, dedupe by id, newest first. Every number on
  // this page (tabs, chips, tiles) derives from this merge so nothing
  // can disagree with the list below it.
  const merged = useMemo(() => {
    const map = new Map<string, Damage>();
    for (const d of [...rows, ...openRows]) if (!map.has(d.id)) map.set(d.id, d);
    return Array.from(map.values()).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [rows, openRows]);

  const tabItems = useMemo(() => {
    if (tab === "open") return merged.filter((d) => !d.resolved);
    if (tab === "resolved") return merged.filter((d) => d.resolved);
    return merged;
  }, [merged, tab]);

  const filtered = useFuzzyItems(
    tabItems,
    search,
    [
      { key: "notes" as any, weight: 2 },
      { key: "description" as any, weight: 2 },
      { key: "damage_type" as any, weight: 2 },
      { key: ((d: Damage) => damageReporterName(d)) as any, weight: 2, label: "reporter" },
      { key: ((d: Damage) => d.order?.order_number || "") as any, weight: 2, label: "order" },
      { key: ((d: Damage) => d.order?.client_name || "") as any, weight: 1, label: "client" },
    ],
    { limit: 0 },
  );

  const stats = useMemo(() => {
    const open = merged.filter((d) => !d.resolved).length;
    const resolved = merged.filter((d) => d.resolved).length;
    const cost = merged.filter((d) => !d.resolved).reduce((s, d) => s + damageCost(d), 0);
    return { open, resolved, cost };
  }, [merged]);

  const openCreate = () => {
    setCreating(true);
    setEquipmentId("");
    setDamageType("damage");
    setNotes("");
    setRepairCost("");
  };
  const closeCreate = () => { setCreating(false); setEquipmentId(""); setDamageType("damage"); setNotes(""); setRepairCost(""); };

  const saveCreate = async () => {
    if (saving) return;
    if (!user?.id || !user?.company_id || !notes.trim()) {
      toast({ title: "Notes are required", variant: "destructive" });
      return;
    }
    const parsedRepairCost = repairCost ? Number(repairCost) : null;
    if (parsedRepairCost != null && (!Number.isFinite(parsedRepairCost) || parsedRepairCost < 0)) {
      toast({ title: "Enter a valid repair cost", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: inserted, error } = await supabase
        .from("equipment_damages")
        .insert([{
          company_id: user.company_id,
          // Cleaning follow-up (migration 20260521120000): the form's
          // equipment-picker now persists to a real column instead of
          // being silently dropped. Nullable for the case where the
          // cleaner doesn't know which specific item is involved.
          equipment_id: equipmentId || null,
          damage_type: damageType,
          notes: notes.trim(),
          repair_cost: parsedRepairCost,
          reported_by: user.id,
          responsible_name: reporterNameFromUser(user),
          damage_stage: "cleaning",
          resolved: false,
        }] as never)
        .select("id")
        .single();
      if (error) throw error;
      toast({ title: "Damage report created" });

      // Phase 3c cleaning sweep: previously the damage row landed in
      // the DB and nobody downstream got told. Kitchen / admin only
      // saw it on their next manual review of the damage ledger,
      // which meant a broken chafing dish at Friday's event was
      // discovered when packing Saturday's equipment. Broadcast to
      // kitchen-aware admin roles so they can replan / re-stock.
      // notification_type 'equipment_shortage' is the existing enum
      // value that already carries the same kitchen-impact semantic
      // (no new enum migration required).
      try {
        // Respect the cleaning settings: notify admins whenever damage is
        // logged (notifyAdminOnDamage), and always escalate when the repair
        // cost is at/above the damageThresholdR floor even if the toggle is
        // off. Threshold breaches ride at high priority.
        const { getCleaningSettings } = await import("@/services/cleaningSettingsService");
        const { settings } = await getCleaningSettings(user.company_id);
        const overThreshold = parsedRepairCost >= Number(settings.damageThresholdR || 0) && parsedRepairCost > 0;
        if (settings.notifyAdminOnDamage || overThreshold) {
          const eqLabel = equipmentId
            ? (equipment.find((e) => e.id === equipmentId)?.name || "an item")
            : "an item";
          const costLabel = parsedRepairCost ? ` Repair estimate ${formatZAR(parsedRepairCost)}.` : "";
          await notificationService.broadcastNotification({
            companyId: user.company_id,
            targetRoles: ["company_admin", "admin", "owner"] as any,
            title: `Equipment damage logged: ${damageType}`,
            message: `Cleaning reported ${damageType} on ${eqLabel}.${costLabel} ${notes.trim().slice(0, 120)}`,
            type: "equipment_shortage" as any,
            priority: overThreshold ? "high" : "normal",
            link: "/admin/equipment?tab=shortages",
            relatedEntityType: "equipment_damage",
            relatedEntityId: (inserted as any)?.id || null,
            dedup: true,
            dedupWindowMinutes: 60,
          });
        }
      } catch (notifErr) {
        // Non-fatal: the damage row is the source of truth, the
        // notification is the heads-up. Log + continue.
        console.warn("[damage.tsx] notification broadcast failed:", notifErr);
      }

      closeCreate();
      void load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const markResolved = async (id: string) => {
    if (!user?.company_id || resolvingIds.has(id)) return;
    setResolvingIds((prev) => new Set(prev).add(id));
    try {
      // Supabase errors don't throw on their own: check the write so a
      // failed update can't toast "Marked resolved".
      const { error } = await supabase
        .from("equipment_damages")
        // Cast: generated types.ts lags the live schema (resolved_at /
        // resolved_by_user_id exist in prod), same as the insert above.
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by_user_id: user.id,
        } as never)
        .eq("id", id)
        .eq("company_id", user.company_id);
      if (error) throw error;
      toast({ title: "Marked resolved" });
      void load();
    } catch {
      toast({ title: "Could not update", variant: "destructive" });
    } finally {
      setResolvingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const showSkeleton = loading && !loaded;
  const chipsReady = loaded && !loadError;

  return (
    <>
      <CleaningPageShell
        pageTitle="Damage reports - CateringMS"
        heading="Damage reports"
        subheading={
          chipsReady
            ? stats.open > 0
              ? `${stats.open} open report${stats.open === 1 ? "" : "s"} worth ${formatZAR(stats.cost, { decimals: 0 })} still need attention.`
              : "No open damage reports, the register is clear."
            : "Track damaged or lost equipment with replacement cost estimates."
        }
        icon={FileWarning}
        headerAction={
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />Report damage
          </Button>
        }
        meta={
          chipsReady ? (
            <>
              <span className={CLEANING_HERO_CHIP}>
                <span className={cn("h-1.5 w-1.5 rounded-full", stats.open > 0 ? "bg-rose-400" : "bg-emerald-400")} />
                {stats.open} open
              </span>
              {stats.cost > 0 && (
                <span className={CLEANING_HERO_CHIP}>
                  <AlertTriangle className="h-3 w-3" />
                  {formatZAR(stats.cost, { decimals: 0 })} outstanding
                </span>
              )}
              <span className={CLEANING_HERO_CHIP}>
                <Check className="h-3 w-3" />
                {stats.resolved} resolved recently
              </span>
            </>
          ) : undefined
        }
      >
        {/* Recovery card: the load failed. Never dress a failed load up
            as an empty damage register. */}
        {loadError && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40">
            <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Couldn&apos;t load the damage register</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{loadError}</p>
            <Button
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              className="bg-brand-primary hover:opacity-90 text-white"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin motion-reduce:animate-none")} />
              Retry
            </Button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <StatTile label="Open reports" value={chipsReady ? stats.open : "--"} hint="Still need fixing" />
          <StatTile label="Resolved" value={chipsReady ? stats.resolved : "--"} hint="In the latest reports" />
          <StatTile
            label="Outstanding cost"
            value={chipsReady ? formatZAR(stats.cost, { decimals: 0 }) : "--"}
            hint="Across open reports"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {(["open", "resolved", "all"] as const).map((t) => (
            <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)} className={tab === t ? "bg-brand-primary hover:bg-brand-primary/90 capitalize" : "capitalize"}>
              {t}
            </Button>
          ))}
          <div className="ml-auto relative max-w-xs flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <Input className="pl-9 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500" placeholder="Search notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <PortalCard padded={false}>
          {showSkeleton ? (
            <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading damage reports">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse motion-reduce:animate-none" />
              ))}
            </div>
          ) : loadError && merged.length === 0 ? (
            <div className="py-10 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
              The damage register is unavailable right now. Use Retry above to reload it.
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 px-6 text-slate-500 dark:text-slate-400">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p className="font-medium text-slate-700 dark:text-slate-200">No damage reports{tab !== "all" ? ` (${tab})` : ""}</p>
              <p className="text-xs mt-1">
                {search
                  ? "Nothing matches the search, clear it to see the full list"
                  : tab === "open"
                    ? "Nothing is waiting on a fix. Log new damage with the button above."
                    : "Reports will show here as the team logs them"}
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />Report damage
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((d) => {
                // Cleaning follow-up: now that equipment_id
                // persists, surface the equipment name on the
                // ledger row so admins can correlate damages with
                // specific items at a glance. Fall back to no chip
                // for legacy rows (equipment_id NULL).
                const eq = d.equipment_id
                  ? equipment.find((e) => e.id === d.equipment_id)
                  : null;
                const reporterName = damageReporterName(d);
                const reporterRole = damageReporterRole(d);
                return (
                <li key={d.id} className="p-4 flex items-start gap-3">
                  <AlertTriangle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${d.resolved ? "text-brand-primary dark:text-brand-primary" : "text-amber-500 dark:text-amber-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="outline" className={`${typeTone[d.damage_type ?? ""] ?? "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"} text-xs capitalize`}>{d.damage_type ?? "damage"}</Badge>
                      {eq?.name && (
                        <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 text-xs font-medium">
                          {eq.name}{damageQty(d) > 1 ? ` x${damageQty(d)}` : ""}
                        </Badge>
                      )}
                      {d.resolved ? (
                        <Badge variant="outline" className="bg-brand-primary/15 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30 text-xs">Resolved</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900 text-xs">Open</Badge>
                      )}
                      {damageCost(d) > 0 && (
                        <span className="text-xs tabular-nums font-semibold text-rose-700 dark:text-rose-300">{formatZAR(damageCost(d))}</span>
                      )}
                      {d.created_at && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}</span>
                      )}
                      {d.damage_stage && (
                        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 text-xs capitalize">
                          {d.damage_stage.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
                    {/* Event + client context so this reads as a billable line:
                        which event it happened on + who to charge. */}
                    {(d.order?.order_number || d.order?.event_name || d.order?.client_name) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                        {d.order?.order_number && (
                          <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" />{d.order.order_number}</span>
                        )}
                        {d.order?.event_name && d.order.event_name !== "Untitled" && (
                          <span>{d.order.event_name}</span>
                        )}
                        {d.order?.event_date && (
                          <span className="inline-flex items-center gap-1"><CalendarIcon className="w-3 h-3" />{d.order.event_date}</span>
                        )}
                        {d.order?.client_name && (
                          <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{d.order.client_name}</span>
                        )}
                      </div>
                    )}
                    {damageDescription(d) && <p className="text-sm text-slate-700 dark:text-slate-300">{damageDescription(d)}</p>}
                    <div className="flex flex-wrap items-center gap-3 mt-1">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Reported by {reporterName}{reporterRole ? ` (${reporterRole})` : ""}
                      </span>
                      {d.photo_url && (
                        <a href={d.photo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand-primary hover:underline">
                          <ImageIcon className="w-3 h-3" /> View photo
                        </a>
                      )}
                    </div>
                  </div>
                  {!d.resolved && (
                    <Button size="sm" variant="ghost" onClick={() => markResolved(d.id)} disabled={resolvingIds.has(d.id)}>
                      {resolvingIds.has(d.id)
                        ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Resolving</>
                        : <><Check className="h-4 w-4 mr-1" />Resolve</>}
                    </Button>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </PortalCard>
      </CleaningPageShell>

      <Dialog open={creating} onOpenChange={(o) => !o && closeCreate()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report damage</DialogTitle>
            <DialogDescription>Capture damaged or missing equipment after a function</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="eq">Equipment (optional)</Label>
              <Select value={equipmentId} onValueChange={(v) => {
                setEquipmentId(v);
                const eq = equipment.find((e) => e.id === v);
                if (eq?.replacement_cost) setRepairCost(String(eq.replacement_cost));
              }}>
                <SelectTrigger id="eq"><SelectValue placeholder="Pick item if applicable" /></SelectTrigger>
                <SelectContent>{equipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dt">Type</Label>
              <Select value={damageType} onValueChange={setDamageType}>
                <SelectTrigger id="dt"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="damage">Damage</SelectItem>
                  <SelectItem value="missing">Missing</SelectItem>
                  <SelectItem value="broken">Broken</SelectItem>
                  <SelectItem value="worn">Worn</SelectItem>
                  <SelectItem value="cosmetic">Cosmetic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="nt">Description</Label>
              <Textarea id="nt" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened, where, and how bad" />
            </div>
            <div>
              <Label htmlFor="rc">Repair / replacement cost (R)</Label>
              <Input id="rc" type="number" min="0" step="0.01" value={repairCost} onChange={(e) => setRepairCost(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreate} disabled={saving}>Cancel</Button>
            <Button onClick={saveCreate} disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CleaningDamagePage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.CLEANING_MANAGER,
        UserRole.CLEANING_STAFF,
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.REGION_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <CleaningDamagePageInner />
    </ProtectedRoute>
  );
}
