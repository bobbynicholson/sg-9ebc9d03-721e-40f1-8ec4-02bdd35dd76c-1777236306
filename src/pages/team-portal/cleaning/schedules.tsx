import { useState, useEffect, useMemo } from "react";
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
import { Calendar, Plus, Loader2, Clock, RefreshCw } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalCard } from "@/components/portal/ui";
import { CleaningPageShell, CLEANING_HERO_CHIP } from "@/components/cleaning/CleaningPageShell";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { UserRole } from "@/types/app";

interface Schedule {
  id: string;
  area_name: string | null;
  description: string | null;
  frequency: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  assigned_to: string | null;
  status: string | null;
  notes: string | null;
}

const statusTone: Record<string, string> = {
  pending:     "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  scheduled:   "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  completed:   "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30",
  overdue:     "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
};

const STATUS_FALLBACK = "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";

function CleaningSchedulesPageInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();

  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  // Command-centre restructure (2026-07-02): a failed read used to
  // toast once and leave the page on the "no schedules yet" empty
  // state. Failures now land here and render a rose recovery card
  // with a Retry that re-runs the loader.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [areaName, setAreaName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [scheduledDate, setScheduledDate] = useState(toLocalISO(new Date()));
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id]);

  // Prefill the new-schedule time from the cleaning settings default so
  // the "Default daily start time" toggle actually does something.
  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;
    void (async () => {
      const { getCleaningSettings } = await import("@/services/cleaningSettingsService");
      const { settings } = await getCleaningSettings(user.company_id);
      if (!cancelled && settings.defaultDailyTime) setScheduledTime(settings.defaultDailyTime);
    })();
    return () => { cancelled = true; };
  }, [user?.company_id]);

  useEffect(() => {
    if (!user?.company_id) return;
    // Unique per-mount suffix: a fixed channel name collides when the
    // page remounts fast (recurring realtime bug class in this repo).
    const channel = supabase
      .channel(`cleaning-schedules-${user.company_id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cleaning_schedules", filter: `company_id=eq.${user.company_id}` },
        () => void load(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    // Skeleton only before the first successful load; realtime-driven
    // refreshes swap the data in place without blanking the list.
    if (!loaded) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cleaning_schedules")
        .select("*")
        .eq("company_id", user.company_id)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true })
        .limit(200)
        .returns<Schedule[]>();
      if (error) throw error;
      setItems(data || []);
      setLoadError(null);
      setLoaded(true);
    } catch (e: any) {
      // Surface the failure as a recovery card; never render the
      // "no schedules yet" empty state over a failed load.
      setLoadError(e?.message || "We couldn't load the schedules. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    items.forEach((s) => {
      const k = s.scheduled_date ?? "Unscheduled";
      if (!map[k]) map[k] = [];
      map[k].push(s);
    });
    return map;
  }, [items]);

  const openCreate = () => {
    setCreating(true);
    setAreaName("");
    setDescription("");
    setFrequency("daily");
    setScheduledDate(toLocalISO(new Date()));
    setScheduledTime("09:00");
  };
  const closeCreate = () => setCreating(false);

  const saveCreate = async () => {
    if (!user?.id || !user?.company_id || !areaName.trim()) {
      toast({ title: "Area name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("cleaning_schedules").insert([{
        company_id: user.company_id,
        area_name: areaName.trim(),
        description: description.trim() || null,
        frequency,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime || null,
        status: "scheduled",
      }] as never);
      if (error) throw error;
      toast({ title: "Schedule created" });
      closeCreate();
      load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const showSkeleton = loading && !loaded;
  const chipsReady = loaded && !loadError;
  const todayIso = toLocalISO(new Date());
  const todayCount = items.filter((s) => s.scheduled_date === todayIso).length;

  return (
    <>
      <CleaningPageShell
        pageTitle="Cleaning schedules - CateringMS"
        heading="Cleaning schedules"
        icon={Calendar}
        subheading={
          <>
            Dated cleaning checklists with a cadence label for each area. Open the{" "}
            <a href={withSlug("/team-portal/cleaning/tasks")} className="underline">tasks</a>{" "}
            board for start, complete, and notes.
          </>
        }
        headerAction={
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />New schedule
          </Button>
        }
        meta={
          chipsReady ? (
            <>
              <span className={CLEANING_HERO_CHIP}>
                <Calendar className="h-3 w-3" />
                {items.length} schedule{items.length === 1 ? "" : "s"}
              </span>
              {todayCount > 0 && (
                <span className={CLEANING_HERO_CHIP}>
                  <Clock className="h-3 w-3" />
                  {todayCount} today
                </span>
              )}
            </>
          ) : undefined
        }
      >
          {/* Recovery card: the load failed. Keep any last-good list
              below, but never dress a failure up as an empty plan. */}
          {loadError && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40">
              <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Couldn&apos;t load the schedules</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{loadError}</p>
              <Button
                size="sm"
                onClick={() => void load()}
                disabled={loading}
                className="bg-brand-primary hover:opacity-90 text-white"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} />
                Retry
              </Button>
            </div>
          )}

          {showSkeleton ? (
            <div className="space-y-4" aria-busy="true" aria-label="Loading schedules">
              {[0, 1, 2].map((g) => (
                <div key={g} className="space-y-2">
                  <div className="h-3 w-40 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                    {[0, 1].map((r) => (
                      <div key={r} className="p-4 flex items-center justify-between gap-3">
                        <div className="h-4 w-48 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                        <div className="h-4 w-12 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : loadError && items.length === 0 ? (
            // The recovery card above owns this state; keep the card
            // body quiet instead of inviting a first schedule over a
            // broken read.
            <PortalCard padded={false}>
              <div className="py-10 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
                The schedule plan is unavailable right now. Use Retry above to reload it.
              </div>
            </PortalCard>
          ) : items.length === 0 ? (
            <PortalCard padded={false}>
              <div className="text-center py-16 px-6">
                <Calendar className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                <p className="font-medium text-slate-900 dark:text-white">No schedules yet</p>
                <p className="text-xs mt-1 text-slate-500 dark:text-slate-400">Add your first cleaning checklist schedule to get started.</p>
                <div className="mt-4 flex justify-center">
                  <Button size="sm" variant="outline" onClick={openCreate}>
                    <Plus className="h-4 w-4 mr-2" />New schedule
                  </Button>
                </div>
              </div>
            </PortalCard>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([date, list]) => (
                <div key={date}>
                  <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 px-1">{date}, {list.length}</h2>
                  <PortalCard padded={false}>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {list.map((s) => (
                        <li key={s.id} className="p-4 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-slate-900 dark:text-white">{s.area_name}</span>
                              {s.status && (
                                <Badge variant="outline" className={`${statusTone[s.status] ?? STATUS_FALLBACK} text-xs capitalize`}>
                                  {s.status.replace("_", " ")}
                                </Badge>
                              )}
                              {s.frequency && (
                                <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 text-xs capitalize">{s.frequency}</Badge>
                              )}
                            </div>
                            {s.description && <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{s.description}</p>}
                          </div>
                          {s.scheduled_time && (
                            <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400 flex items-center gap-1 flex-shrink-0">
                              <Clock className="h-3 w-3 text-slate-400 dark:text-slate-500" />{s.scheduled_time.slice(0, 5)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </PortalCard>
                </div>
              ))}
            </div>
          )}
      </CleaningPageShell>

      <Dialog open={creating} onOpenChange={(o) => !o && closeCreate()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New cleaning schedule</DialogTitle>
            <DialogDescription>Add a dated cleaning checklist task</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="area">Area / item</Label>
              <Input id="area" value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="e.g. Main kitchen, Cold room, Walk-in fridge" autoFocus />
            </div>
            <div>
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional task detail" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="freq">Cadence</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger id="freq"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="once">One-off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dt">Date</Label>
                <Input id="dt" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="tm">Time</Label>
                <Input id="tm" type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreate} disabled={saving}>Cancel</Button>
            <Button onClick={saveCreate} disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : "Create schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CleaningSchedulesPage() {
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
      <CleaningSchedulesPageInner />
    </ProtectedRoute>
  );
}
