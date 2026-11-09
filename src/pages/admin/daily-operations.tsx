import { useEffect, useMemo, useState } from "react";
import { formatClock } from "@/lib/portalTime";
import Head from "next/head";
import { Bell, CalendarDays, CheckCircle2, Clock3, CookingPot, Droplets, Loader2, Save, Settings2, Users } from "lucide-react";
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
import { cleanDailyOperationsTaskTitle } from "@/lib/dailyOperationsCopy";
import { UserRole } from "@/types/app";
import {
  DAILY_OPERATIONS_DEFAULTS,
  getDailyOperationsSettings,
  saveDailyOperationsSettings,
  type DailyOperationsSettings,
  type DailyOperationsTask,
  type DailyOperationsScheduleMode,
  type DailyOperationsTarget,
} from "@/services/dailyOperationsService";

const TARGETS: Array<{ value: DailyOperationsTarget; label: string; help: string }> = [
  { value: "kitchen", label: "Kitchen team", help: "Kitchen staff and kitchen managers" },
  { value: "cleaning", label: "Cleaning team", help: "Cleaning staff and cleaning managers" },
  { value: "both", label: "Kitchen + cleaning", help: "One shared task for either team; a shared person gets one notification" },
];

const WEEKDAYS = [
  { value: 1, label: "Mon", ariaLabel: "Monday" }, { value: 2, label: "Tue", ariaLabel: "Tuesday" },
  { value: 3, label: "Wed", ariaLabel: "Wednesday" }, { value: 4, label: "Thu", ariaLabel: "Thursday" },
  { value: 5, label: "Fri", ariaLabel: "Friday" }, { value: 6, label: "Sat", ariaLabel: "Saturday" },
  { value: 0, label: "Sun", ariaLabel: "Sunday" },
];

const CUSTOM_TITLE_OPTION = "__custom_title__";
const TASK_TITLE_OPTIONS: Record<"kitchen" | "equipment", readonly string[]> = {
  kitchen: [
    "Kitchen area cleaning",
    "Kitchen work surface cleaning",
    "Kitchen floor cleaning",
    "Kitchen area sanitising",
  ],
  equipment: [
    "Kitchen equipment cleaning",
    "Kitchen equipment sanitising",
    "Cooking equipment cleaning",
    "Fridge and freezer cleaning",
  ],
};

function TargetSelect({ value, onChange }: { value: DailyOperationsTarget; onChange: (value: DailyOperationsTarget) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as DailyOperationsTarget)} className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 dark:border-slate-700 dark:bg-slate-900 sm:text-sm">
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
  const taskName = kitchen ? "Kitchen area cleaning" : "Kitchen equipment cleaning";
  const taskDescription = kitchen
    ? "Reset the kitchen work area for service."
    : "Clean and sanitise equipment used to prepare food.";
  const get = <K extends keyof DailyOperationsSettings>(key: K) => settings[key];
  const set = <K extends keyof DailyOperationsSettings>(key: K, value: DailyOperationsSettings[K]) => setSettings({ ...settings, [key]: value });
  const scheduleModeKey = `${prefix}_schedule_mode` as keyof DailyOperationsSettings;
  const weekdaysKey = `${prefix}_weekdays` as keyof DailyOperationsSettings;
  const enabledKey = `${prefix}_enabled` as keyof DailyOperationsSettings;
  const titleKey = `${prefix}_title` as keyof DailyOperationsSettings;
  const title = String(get(titleKey) || "");
  const titleIsPreset = TASK_TITLE_OPTIONS[kind].includes(title);
  const customTitle = !titleIsPreset;
  const scheduleMode = get(scheduleModeKey) as DailyOperationsScheduleMode;
  const weekdays = get(weekdaysKey) as number[];
  const enabled = Boolean(get(enabledKey));
  const selectedTarget = get(`${prefix}_target` as keyof DailyOperationsSettings) as DailyOperationsTarget;
  const targetLabel = TARGETS.find((target) => target.value === selectedTarget)?.label || "assigned team";
  const toggleWeekday = (day: number) => {
    const next = weekdays.includes(day) ? weekdays.filter((value) => value !== day) : [...weekdays, day];
    set(weekdaysKey, next as never);
  };
  const scheduleHelp = scheduleMode === "staff_scheduled"
    ? `Only create this task and send reminders when ${targetLabel} has a shift on the roster for that date.`
    : scheduleMode === "selected_weekdays"
      ? "Run on the selected weekdays every week, whether or not a staff shift is entered."
      : "Run every day, including days with no staff shift.";
  return (
    <PortalCard className="min-w-0">
      <div className="mb-5 flex items-start justify-between gap-3 sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 rounded-xl bg-brand-primary/10 p-2.5 text-brand-primary">{kitchen ? <CookingPot className="h-5 w-5" /> : <Droplets className="h-5 w-5" />}</div>
          <div className="min-w-0">
            <h2 className="break-words font-semibold leading-5 text-slate-900 dark:text-white">{taskName}</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{taskDescription}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{enabled ? "Enabled" : "Disabled"}</span>
          <Switch checked={enabled} onCheckedChange={(value) => set(enabledKey, value as never)} aria-label={`Enable ${taskName.toLowerCase()}`} />
        </div>
      </div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0"><Label htmlFor={`${kind}-time`}>Task time</Label><Input id={`${kind}-time`} type="time" value={String(get(`${prefix}_time` as keyof DailyOperationsSettings))} onChange={(e) => set(`${prefix}_time` as keyof DailyOperationsSettings, e.target.value as never)} className="mt-1.5 h-11 w-full sm:max-w-xs" /></div>
        <div className="min-w-0"><Label htmlFor={`${kind}-lead`}>Remind staff (hours before)</Label><Input id={`${kind}-lead`} type="number" min="0" max="72" step="0.5" value={String(get(`${prefix}_lead_hours` as keyof DailyOperationsSettings))} onChange={(e) => set(`${prefix}_lead_hours` as keyof DailyOperationsSettings, Number(e.target.value) as never)} className="mt-1.5 h-11 w-full sm:max-w-xs" /></div>
        <div className="min-w-0">
          <Label htmlFor={`${kind}-title`}>Task title shown to staff</Label>
          <select
            id={`${kind}-title`}
            value={titleIsPreset ? title : CUSTOM_TITLE_OPTION}
            onChange={(e) => set(titleKey, (e.target.value === CUSTOM_TITLE_OPTION ? "" : e.target.value) as never)}
            className="mt-1.5 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 dark:border-slate-700 dark:bg-slate-900 sm:text-sm"
          >
            <optgroup label="Suggested titles">
              {TASK_TITLE_OPTIONS[kind].map((option) => <option key={option} value={option}>{option}</option>)}
            </optgroup>
            <option value={CUSTOM_TITLE_OPTION}>Write a custom title</option>
          </select>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">This name appears on the staff task and its reminder.</p>
          {customTitle && <div className="mt-2">
            <Label htmlFor={`${kind}-custom-title`}>Custom task title</Label>
            <Input
              id={`${kind}-custom-title`}
              value={title}
              onChange={(e) => set(titleKey, e.target.value as never)}
              maxLength={80}
              required
              aria-invalid={!title.trim()}
              placeholder={kind === "kitchen" ? "e.g. Sanitise kitchen worktops" : "e.g. Clean the spit machine"}
              className="mt-1.5 h-11 w-full"
            />
            {!title.trim() && <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">Enter a short title before saving.</p>}
          </div>}
        </div>
        <div className="min-w-0"><Label htmlFor={`${kind}-target`}>Assign and notify</Label><div className="mt-1.5"><TargetSelect value={selectedTarget} onChange={(value) => set(`${prefix}_target` as keyof DailyOperationsSettings, value as never)} /></div><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{TARGETS.find((target) => target.value === selectedTarget)?.help}</p></div>
      </div>
      <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="flex min-w-0 items-start gap-2.5">
          <CalendarDays className="mt-1 h-4 w-4 shrink-0 text-brand-primary" />
          <div className="min-w-0 flex-1">
            <Label htmlFor={`${kind}-schedule-mode`}>When should this task run?</Label>
            <select id={`${kind}-schedule-mode`} value={scheduleMode} onChange={(e) => set(scheduleModeKey, e.target.value as never)} className="mt-1.5 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 dark:border-slate-700 dark:bg-slate-900 sm:text-sm">
              <option value="staff_scheduled">Only when staff are scheduled</option>
              <option value="selected_weekdays">On selected weekdays</option>
              <option value="every_day">Every day</option>
            </select>
            <p className="mt-1.5 text-sm leading-5 text-slate-600 dark:text-slate-300">{scheduleHelp}</p>
            {scheduleMode === "selected_weekdays" && <div className="mt-3">
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Choose weekdays</p>
              <div className="grid grid-cols-4 gap-2 min-[420px]:grid-cols-7" role="group" aria-label={`${taskName} weekdays`}>
                {WEEKDAYS.map((day) => {
                  const selected = weekdays.includes(day.value);
                  return <Button key={day.value} type="button" size="default" variant={selected ? "default" : "outline"} aria-label={day.ariaLabel} aria-pressed={selected} onClick={() => toggleWeekday(day.value)} className="h-11 w-full min-w-0 px-2">
                    {day.label}
                  </Button>;
                })}
              </div>
              {weekdays.length === 0 && <p role="alert" className="mt-2 text-sm font-medium text-red-600">Select at least one weekday before saving.</p>}
            </div>}
          </div>
        </div>
      </div>
      <div className="mt-4 min-w-0"><Label htmlFor={`${kind}-description`}>Instructions for staff</Label><textarea id={`${kind}-description`} value={String(get(`${prefix}_description` as keyof DailyOperationsSettings))} onChange={(e) => set(`${prefix}_description` as keyof DailyOperationsSettings, e.target.value as never)} rows={4} className="mt-1.5 min-h-28 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-base leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 dark:border-slate-700 dark:bg-slate-900 sm:text-sm" /></div>
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

  const hasInvalidWeekdaySchedule = (
    settings.kitchen_cleaning_schedule_mode === "selected_weekdays" && settings.kitchen_cleaning_weekdays.length === 0
  ) || (
    settings.equipment_cleaning_schedule_mode === "selected_weekdays" && settings.equipment_cleaning_weekdays.length === 0
  );
  const hasInvalidTaskTitle = !settings.kitchen_cleaning_title.trim() || !settings.equipment_cleaning_title.trim();

  const load = async () => {
    if (!user?.company_id) return;
    try {
      const [loadedSettings, taskResult] = await Promise.all([
        getDailyOperationsSettings(user.company_id),
        (supabase as any).from("daily_operations_tasks").select("*").eq("company_id", user.company_id).order("task_date", { ascending: false }).order("scheduled_time", { ascending: true }).limit(10),
      ]);
      if (taskResult.error) throw taskResult.error;
      setSettings(loadedSettings);
      setTasks(((taskResult.data || []) as DailyOperationsTask[]).map((task) => ({
        ...task,
        title: cleanDailyOperationsTaskTitle(task.task_kind, task.title),
      })));
    } catch (error: any) {
      toast({ title: "Could not load cleaning schedules", description: error?.message || "Check your connection and retry.", variant: "destructive" });
    } finally { setLoaded(true); }
  };

  useEffect(() => { void load(); }, [user?.company_id]);

  const save = async () => {
    if (!user?.company_id || saving) return;
    setSaving(true);
    try {
      await saveDailyOperationsSettings(user.company_id, settings);
      toast({ title: "Cleaning schedules saved", description: "Task dates and reminders will follow the selected schedule rules." });
      await load();
    } catch (error: any) {
      const message = String(error?.message || "");
      const schemaMissing = /schema cache|column .* does not exist|PGRST204/i.test(message);
      toast({
        title: "Could not save cleaning schedules",
        description: schemaMissing
          ? "The schedule settings update is not installed in the database yet. Apply the latest database update, then retry."
          : message || "Check your connection and try again.",
        variant: "destructive",
      });
    } finally { setSaving(false); }
  };

  const openTasks = useMemo(() => tasks.filter((task) => task.status === "scheduled" || task.status === "in_progress"), [tasks]);
  return (
    <>
      <Head><title>Cleaning task schedules - CateringMS</title></Head>
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell>
          <PortalHeader variant="hero" title="Cleaning task schedules" subtitle="Set when kitchen area and equipment cleaning should happen, and who gets notified." icon={Settings2} actions={<Button onClick={() => void save()} disabled={!loaded || saving || hasInvalidWeekdaySchedule || hasInvalidTaskTitle} className="bg-white text-slate-900 hover:bg-white/90">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving</> : <><Save className="mr-2 h-4 w-4" />Save schedules</>}</Button>} meta={<><span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"><Clock3 className="h-3 w-3" />Company timezone</span><span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"><Bell className="h-3 w-3" />Checks every 15 min</span></>} />
          <PageWorkbench />
          {!loaded ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : <div className="space-y-4">
            <PortalCard className="border-brand-primary/20 bg-brand-primary/5 dark:bg-brand-primary/10"><div className="flex items-start gap-3"><Bell className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" /><div><h2 className="font-semibold text-slate-900 dark:text-white">Schedule rules</h2><p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">Set a rule for each task below: follow the assigned team roster, choose weekdays, or run every day. Roster-based tasks are created only when that team has a shift on the date. Staff reminders use the lead time you set.</p></div></div></PortalCard>
            <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
              <ScheduleCard kind="kitchen" settings={settings} setSettings={setSettings} />
              <ScheduleCard kind="equipment" settings={settings} setSettings={setSettings} />
            </div>
            <PortalCard className="min-w-0"><div className="mb-4 flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="font-semibold text-slate-900 dark:text-white">Open cleaning tasks</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Upcoming or in progress. Staff start and complete tasks in their portal.</p></div><Users className="h-5 w-5 shrink-0 text-slate-400" /></div>{openTasks.length === 0 ? <p className="py-5 text-sm leading-5 text-slate-500 dark:text-slate-400">No open cleaning tasks. Tasks appear on the next eligible roster date or selected weekday.</p> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{openTasks.map((task) => <div key={task.id} className="flex min-w-0 flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"><div className="min-w-0"><p className="break-words font-medium text-slate-900 dark:text-white">{task.title}</p><p className="text-xs text-slate-500 dark:text-slate-400">{task.task_date} at {formatClock(task.scheduled_time)} · {task.status.replace("_", " ")}</p></div><span className="inline-flex min-w-0 items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" /><span className="break-words">{task.target_roles.map((role) => role.replace(/_/g, " ")).join(", ")}</span></span></div>)}</div>}</PortalCard>
          </div>}
        </PortalShell>
      </div>
    </>
  );
}

export default function DailyOperationsPage() {
  return <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}><DailyOperationsPageInner /></ProtectedRoute>;
}

