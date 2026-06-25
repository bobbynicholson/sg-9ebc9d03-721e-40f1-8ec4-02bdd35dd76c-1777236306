import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
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
import { Calendar, Plus, Loader2, Clock } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { PortalShell, PortalHeader, PortalCard } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";

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

export default function CleaningSchedulesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();

  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
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

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
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
    } catch (e) {
      toast({ title: "Could not load schedules", variant: "destructive" });
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

  return (
    <>
      <Head><title>Cleaning schedules - CateringMS</title></Head>
      <NoIndexMeta />
      <CleaningNav />
      <main className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Cleaning schedules"
            icon={Calendar}
            subtitle={
              <>
                Recurring plan - daily / weekly / monthly cadence per area. Spawns the day's{" "}
                <a href={withSlug("/team-portal/cleaning/tasks")} className="text-brand-primary underline">tasks</a>{" "}
                that the team actually ticks off.
              </>
            }
            actions={
              <Button onClick={openCreate} className="bg-brand-primary hover:bg-brand-primary/90">
                <Plus className="h-4 w-4 mr-2" />New schedule
              </Button>
            }
          />

          {loading ? (
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
          ) : items.length === 0 ? (
            <PortalCard padded={false}>
              <div className="text-center py-16 px-6">
                <Calendar className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                <p className="font-medium text-slate-900 dark:text-white">No schedules yet</p>
                <p className="text-xs mt-1 text-slate-500 dark:text-slate-400">Add your first recurring cleaning plan to get started.</p>
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
        </PortalShell>
      </main>

      <Dialog open={creating} onOpenChange={(o) => !o && closeCreate()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New cleaning schedule</DialogTitle>
            <DialogDescription>Add a recurring or one-off cleaning task</DialogDescription>
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
                <Label htmlFor="freq">Frequency</Label>
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
