import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { Bell, CheckCircle2, Clock3, CookingPot, Droplets, Loader2, Save, Settings2, Users } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalHeader, PageWorkbench, PortalShell, PortalCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/app";
import {
  DAILY_OPERATIONS_DEFAULTS,
  getDailyOperationsSettings,
  saveDailyOperationsSettings,
  type DailyOperationsSettings,
  type DailyOperationsTask,
  type DailyOperationsTarget,
} from "@/services/dailyOperationsService";

const TARGETS: Array<{ value: DailyOperationsTarget; label: string; help: string }> = [
  { value: "kitchen", label: "Kitchen team", help: "Kitchen staff and kitchen managers" },
  { value: "cleaning", label: "Cleaning team", help: "Cleaning staff and cleaning managers" },
  { value: "both", label: "Kitchen + cleaning", help: "One shared task for either team; a shared person gets one notification" },
];

function TargetSelect({ value, onChange }: { value: DailyOperationsTarget; onChange: (value: DailyOperationsTarget) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as DailyOperationsTarget)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
      {TARGETS.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}
    </select>
  );
}

function ScheduleCard({
  kind,
  settings,
  setSettings,
}: {
  kind: "kitchen" | "equipment";
  settings: DailyOperationsSettings;
  setSettings: (next: DailyOperationsSettings) => void;
}) {
  const kitchen = kind === "kitchen";
  const prefix = kitchen ? "kitchen_cleaning" : "equipment_cleaning";
  const get = <K extends keyof DailyOperationsSettings>(key: K) => settings[key];
  const set = <K extends keyof DailyOperationsSettings>(key: K, value: DailyOperationsSettings[K]) => setSettings({ ...settings, [key]: value });
  return (
    <PortalCard>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-brand-primary/10 p-2.5 text-brand-primary">{kitchen ? <CookingPot className="h-5 w-5" /> : <Droplets className="h-5 w-5" />}</div>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">{kitchen ? "Daily kitchen clean" : "Daily kitchen-equipment clean"}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{kitchen ? "Reset the kitchen work area once every day." : "Clean and sanitise equipment used to prepare orders once every day."}</p>
          </div>
        </div>
        <Switch checked={Boolean(get(`${prefix}_enabled` as keyof DailyOperationsSettings))} onCheckedChange={(value) => set(`${prefix}_enabled` as keyof DailyOperationsSettings, value as never)} aria-label={`Enable ${kind} daily task`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div><Label htmlFor={`${kind}-time`}>Task time</Label><Input id={`${kind}-time`} type="time" value={String(get(`${prefix}_time` as keyof DailyOperationsSettings))} onChange={(e) => set(`${prefix}_time` as keyof DailyOperationsSettings, e.target.value as never)} className="mt-1.5 w-40" /></div>
        <div><Label htmlFor={`${kind}-lead`}>Notify before (hours)</Label><Input id={`${kind}-lead`} type="number" min="0" max="72" step="0.5" value={String(get(`${prefix}_lead_hours` as keyof DailyOperationsSettings))} onChange={(e) => set(`${prefix}_lead_hours` as keyof DailyOperationsSettings, Number(e.target.value) as never)} className="mt-1.5 w-40" /></div>
        <div><Label htmlFor={`${kind}-title`}>Event / task name</Label><Input id={`${kind}-title`} value={String(get(`${prefix}_title` as keyof DailyOperationsSettings))} onChange={(e) => set(`${prefix}_title` as keyof DailyOperationsSettings, e.target.value as never)} className="mt-1.5" /></div>
        <div><Label htmlFor={`${kind}-target`}>Notify and assign to</Label><div className="mt-1.5"><TargetSelect value={get(`${prefix}_target` as keyof DailyOperationsSettings) as DailyOperationsTarget} onChange={(value) => set(`${prefix}_target` as keyof DailyOperationsSettings, value as never)} /></div><p className="mt-1 text-xs text-slate-500">{TARGETS.find((target) => target.value === get(`${prefix}_target` as keyof DailyOperationsSettings))?.help}</p></div>
      </div>
      <div className="mt-4"><Label htmlFor={`${kind}-description`}>Instructions</Label><textarea id={`${kind}-description`} value={String(get(`${prefix}_description` as keyof DailyOperationsSettings))} onChange={(e) => set(`${prefix}_description` as keyof DailyOperationsSettings, e.target.value as never)} rows={3} className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></div>
    </PortalCard>
  );
}

function DailyOperationsPageInner() {
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const [settings, setSettings] = useState<DailyOperationsSettings>(DAILY_OPERATIONS_DEFAULTS);
  const [tasks, setTasks] = useState<DailyOperationsTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user?.company_id) return;
    try {
      const [loadedSettings, taskResult] = await Promise.all([
        getDailyOperationsSettings(user.company_id),
        (supabase as any).from("daily_operations_tasks").select("*").eq("company_id", user.company_id).order("task_date", { ascending: false }).order("scheduled_time", { ascending: true }).limit(10),
      ]);
      if (taskResult.error) throw taskResult.error;
      setSettings(loadedSettings);
      setTasks((taskResult.data || []) as DailyOperationsTask[]);
    } catch (error: any) {
      toast({ title: "Could not load daily operations", description: error?.message || "Run the new database migration, then retry.", variant: "destructive" });
    } finally { setLoaded(true); }
  };

  useEffect(() => { void load(); }, [user?.company_id]);

  const save = async () => {
    if (!user?.company_id || saving) return;
    setSaving(true);
    try {
      await saveDailyOperationsSettings(user.company_id, settings);
      toast({ title: "Daily operations saved", description: "The scheduler will create the next daily tasks and send reminders using these settings." });
      await load();
    } catch (error: any) {
      toast({ title: "Could not save settings", description: error?.message || "Check the database migration and try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const openTasks = useMemo(() => tasks.filter((task) => task.status !== "completed"), [tasks]);
  return (
    <>
      <Head><title>Daily operations - CateringMS</title></Head>
      <AdminNav />
      <div className="min-h-screen lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell>
          <PortalHeader variant="hero" title="Daily operations" subtitle="Configure one daily kitchen clean and one daily kitchen-equipment clean for your company." icon={Settings2} actions={<Button onClick={() => void save()} disabled={!loaded || saving} className="bg-white text-slate-900 hover:bg-white/90">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving</> : <><Save className="mr-2 h-4 w-4" />Save settings</>}</Button>} meta={<><span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white"><Clock3 className="h-3 w-3" />Company timezone</span><span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white"><Bell className="h-3 w-3" />15-minute scheduler</span></>} />
          <PageWorkbench />
          {!loaded ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : <div className="space-y-4">
            <PortalCard className="border-brand-primary/20 bg-brand-primary/5 dark:bg-brand-primary/10"><div className="flex items-start gap-3"><Bell className="mt-0.5 h-5 w-5 text-brand-primary" /><div><h2 className="font-semibold text-slate-900 dark:text-white">How this works</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Tasks are created once per company day in the company time zone. Staff receive one reminder at the configured lead time, and the admin receives a schedule notification. Select “Kitchen + cleaning” when the same person or shared team can do the task; they will not receive duplicate task notifications.</p></div></div></PortalCard>
            <ScheduleCard kind="kitchen" settings={settings} setSettings={setSettings} />
            <ScheduleCard kind="equipment" settings={settings} setSettings={setSettings} />
            <PortalCard><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Recent task instances</h2><p className="mt-1 text-sm text-slate-500">Generated by the daily scheduler; staff start and complete these in their portal.</p></div><Users className="h-5 w-5 text-slate-400" /></div>{openTasks.length === 0 ? <p className="py-6 text-sm text-slate-500">No open daily task instances yet. Enable a schedule and the next scheduler run will create one.</p> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{openTasks.map((task) => <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium text-slate-900 dark:text-white">{task.title}</p><p className="text-xs text-slate-500">{task.task_date} at {task.scheduled_time.slice(0, 5)} · {task.status.replace("_", " ")}</p></div><span className="inline-flex items-center gap-1 text-xs text-slate-500"><CheckCircle2 className="h-3.5 w-3.5" />{task.target_roles.join(", ")}</span></div>)}</div>}</PortalCard>
          </div>}
        </PortalShell>
      </div>
    </>
  );
}

export default function DailyOperationsPage() {
  return <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}><DailyOperationsPageInner /></ProtectedRoute>;
}

