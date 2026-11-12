import { useEffect, useMemo, useState, type FormEvent } from "react";
import { formatClock } from "@/lib/portalTime";
import Head from "next/head";
import Link from "next/link";
import { Bell, CalendarDays, CheckCircle2, Clock3, CookingPot, Droplets, Loader2, Save, Settings2, Users, ClipboardPlus, MapPin, Plus, Truck, X } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalHeader, PageWorkbench, PortalShell, PortalCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AddressAutocomplete } from "@/components/admin/AddressAutocomplete";
import { SupplierPlaceAutocomplete } from "@/components/admin/SupplierPlaceAutocomplete";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_TENANT_TIMEZONE, toZonedISO } from "@/lib/localDate";
import { cleanDailyOperationsTaskTitle } from "@/lib/dailyOperationsCopy";
import { useTenantHref } from "@/lib/tenantUrl";
import { filterRosterStaff } from "@/lib/rosterStaff";
import { dashboardLabelForRoles, shiftTypesForOneOffTask, type OneOffTaskKind } from "@/lib/dailyOperationsTaskTargets";
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

type DailyOperationsStaff = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  active_role: string | null;
  departments?: string[];
};

type OneOffTaskDraft = {
  task_kind: OneOffTaskKind;
  task_date: string;
  scheduled_time: string;
  title: string;
  description: string;
  notify_before_hours: number;
  notify_staff: boolean;
  notify_admins: boolean;
  stops: DriverStopDraft[];
};

type DriverStopDraft = {
  stop_type: "collection" | "delivery" | "other";
  stop_name: string;
  address: string;
  instructions: string;
};

const REMINDER_OPTIONS = [
  { value: 0, label: "At task time" },
  { value: 0.5, label: "30 minutes before" },
  { value: 1, label: "1 hour before" },
  { value: 2, label: "2 hours before" },
  { value: 4, label: "4 hours before" },
  { value: 12, label: "12 hours before" },
  { value: 24, label: "1 day before" },
  { value: 48, label: "2 days before" },
  { value: 72, label: "3 days before" },
];

function rolesForTarget(target: DailyOperationsTarget): string[] {
  if (target === "kitchen") return ["kitchen_staff", "kitchen_manager"];
  if (target === "cleaning") return ["cleaning_staff", "cleaning_manager"];
  return ["kitchen_staff", "kitchen_manager", "cleaning_staff", "cleaning_manager"];
}

function staffMatchesRoles(staff: DailyOperationsStaff, roles: string[]): boolean {
  const memberships = [staff.active_role, staff.role, ...(staff.departments || [])].flatMap((role) =>
    role === "kitchen" ? ["kitchen", "kitchen_staff", "kitchen_manager"]
      : role === "cleaning" ? ["cleaning", "cleaning_staff", "cleaning_manager"]
        : [role || ""],
  );
  return memberships.some((role) => roles.includes(role));
}

function staffLabel(staff: DailyOperationsStaff): string {
  return staff.full_name?.trim() || staff.email || "Unnamed team member";
}

function ReminderSelect({ id, value, onChange }: { id: string; value: number; onChange: (hours: number) => void }) {
  return <select id={id} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1.5 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 dark:border-slate-700 dark:bg-slate-900 sm:text-sm">
    {!REMINDER_OPTIONS.some((option) => option.value === value) && <option value={value}>{value} hours before (current)</option>}
    {REMINDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
}

function shiftCoversTaskTime(shift: { planned_start?: string | null; planned_end?: string | null }, taskTime: string): boolean {
  const parseMinutes = (value: string | null | undefined) => {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null;
  };
  const start = parseMinutes(shift.planned_start);
  const end = parseMinutes(shift.planned_end);
  const task = parseMinutes(taskTime);
  // Missing roster hours cannot prove that someone is present at the
  // requested time. Fail closed so we never create a task against an
  // unverified shift.
  if (start === null || end === null || task === null) return false;
  return end >= start ? task >= start && task <= end : task >= start || task <= end;
}

function offsetIsoDay(value: string, offset: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

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
  staff,
}: {
  kind: "kitchen" | "equipment";
  settings: DailyOperationsSettings;
  setSettings: (next: DailyOperationsSettings) => void;
  staff: DailyOperationsStaff[];
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
  const assignedToKey = `${prefix}_assigned_to` as keyof DailyOperationsSettings;
  const assignedTo = String(get(assignedToKey) || "");
  const eligibleStaff = staff.filter((member) => staffMatchesRoles(member, rolesForTarget(selectedTarget)));
  const targetLabel = TARGETS.find((target) => target.value === selectedTarget)?.label || "assigned team";
  const toggleWeekday = (day: number) => {
    const next = weekdays.includes(day) ? weekdays.filter((value) => value !== day) : [...weekdays, day];
    set(weekdaysKey, next as never);
  };
  const scheduleHelp = scheduleMode === "staff_scheduled"
    ? `Only create this task and send reminders when ${targetLabel} has a shift covering the task time.`
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
        <div className="min-w-0"><Label htmlFor={`${kind}-lead`}>Remind staff in app</Label><ReminderSelect id={`${kind}-lead`} value={Number(get(`${prefix}_lead_hours` as keyof DailyOperationsSettings))} onChange={(hours) => set(`${prefix}_lead_hours` as keyof DailyOperationsSettings, hours as never)} /></div>
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
        <div className="min-w-0">
          <Label htmlFor={`${kind}-target`}>Team to notify</Label>
          <div className="mt-1.5"><TargetSelect value={selectedTarget} onChange={(value) => {
            const next = { ...settings, [`${prefix}_target`]: value } as DailyOperationsSettings;
            if (assignedTo && !staffMatchesRoles(staff.find((member) => member.id === assignedTo) || { id: "", full_name: null, email: null, role: null, active_role: null }, rolesForTarget(value))) {
              (next as any)[assignedToKey] = null;
            }
            setSettings(next);
          }} /></div>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{TARGETS.find((target) => target.value === selectedTarget)?.help}</p>
          <div className="mt-3">
            <Label htmlFor={`${kind}-assigned`}>Assign to one person (optional)</Label>
            <select id={`${kind}-assigned`} value={assignedTo} onChange={(event) => set(assignedToKey, (event.target.value || null) as never)} className="mt-1.5 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 dark:border-slate-700 dark:bg-slate-900 sm:text-sm">
              <option value="">Anyone on the selected team</option>
              {eligibleStaff.map((member) => <option key={member.id} value={member.id}>{staffLabel(member)}</option>)}
            </select>
          </div>
        </div>
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

function OneOffTaskForm({
  creating,
  today,
  onCreate,
}: {
  creating: boolean;
  today: string;
  onCreate: (draft: OneOffTaskDraft) => Promise<boolean>;
}) {
  const { withSlug } = useTenantHref();
  const [draft, setDraft] = useState<OneOffTaskDraft>(() => ({
    task_kind: "custom_kitchen",
    task_date: today,
    scheduled_time: "09:00",
    title: "",
    description: "",
    notify_before_hours: 24,
    notify_staff: true,
    notify_admins: true,
    stops: [{ stop_type: "collection", stop_name: "", address: "", instructions: "" }],
  }));
  const update = <K extends keyof OneOffTaskDraft>(key: K, value: OneOffTaskDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.title.trim()) return;
    if (draft.task_kind === "custom_driver" && (!draft.stops.length || draft.stops.some((stop) => !stop.stop_name.trim() || !stop.address.trim()))) return;
    const created = await onCreate({ ...draft, title: draft.title.trim(), description: draft.description.trim() });
    if (created) setDraft((current) => ({ ...current, title: "", description: "", stops: [{ stop_type: "collection", stop_name: "", address: "", instructions: "" }] }));
  };

  const addStop = () => setDraft((current) => current.stops.length >= 20 ? current : ({ ...current, stops: [...current.stops, { stop_type: "collection", stop_name: "", address: "", instructions: "" }] }));
  const updateStop = (index: number, patch: Partial<DriverStopDraft>) => setDraft((current) => ({ ...current, stops: current.stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...patch } : stop) }));
  const removeStop = (index: number) => setDraft((current) => current.stops.length <= 1 ? current : ({ ...current, stops: current.stops.filter((_, stopIndex) => stopIndex !== index) }));
  const routeStopsValid = draft.task_kind !== "custom_driver" || (draft.stops.length > 0 && draft.stops.every((stop) => stop.stop_name.trim() && stop.address.trim()));

  return (
    <PortalCard id="one-off-task" className="min-w-0 scroll-mt-24">
      <div className="mb-5 flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-brand-primary/10 p-2.5 text-brand-primary"><ClipboardPlus className="h-5 w-5" /></div>
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Create a one-off task</h2><p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">Assign work to a team dashboard. The first eligible team member to start it claims the task and records work time.</p></div>
      </div>
      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <Label htmlFor="one-off-kind">Task type and dashboard</Label>
            <select id="one-off-kind" value={draft.task_kind} onChange={(event) => {
              const nextKind = event.target.value as OneOffTaskDraft["task_kind"];
              setDraft((current) => ({ ...current, task_kind: nextKind }));
            }} className="mt-1.5 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 dark:border-slate-700 dark:bg-slate-900 sm:text-sm">
              <option value="custom_kitchen">Kitchen task · Kitchen dashboard</option>
              <option value="custom_cleaning">Cleaning task · Kitchen + cleaning dashboards</option>
              <option value="custom_both">Shared task · Kitchen + cleaning dashboards</option>
              <option value="custom_driver">Driver route · Driver dashboard</option>
            </select>
          </div>
          <div className="min-w-0"><Label htmlFor="one-off-title">Task name</Label><Input id="one-off-title" value={draft.title} onChange={(event) => update("title", event.target.value)} maxLength={120} required placeholder={draft.task_kind === "custom_kitchen" ? "e.g. Prepare the new menu item" : draft.task_kind === "custom_cleaning" ? "e.g. Wash the uniforms" : draft.task_kind === "custom_driver" ? "e.g. Collect supplier orders" : "e.g. Prepare and clean after service"} className="mt-1.5 h-11 w-full" /></div>
          <div className="min-w-0"><Label htmlFor="one-off-date">Task date</Label><Input id="one-off-date" type="date" min={today} value={draft.task_date} onChange={(event) => update("task_date", event.target.value)} required className="mt-1.5 h-11 w-full" /></div>
          <div className="min-w-0"><Label htmlFor="one-off-time">Task time</Label><Input id="one-off-time" type="time" value={draft.scheduled_time} onChange={(event) => update("scheduled_time", event.target.value)} required className="mt-1.5 h-11 w-full" /></div>
          <div className="min-w-0 sm:col-span-2">
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{draft.task_kind === "custom_kitchen" ? "Kitchen staff can see and complete this task." : draft.task_kind === "custom_cleaning" ? "Cleaning staff can complete it; kitchen staff can also see it." : draft.task_kind === "custom_driver" ? "Drivers can see and claim this route from their dashboard. They mark each stop and finish when they return to the kitchen." : draft.task_kind === "custom_both" ? "Kitchen and cleaning staff can see and complete the same task." : "Assigned to the eligible team; no individual is selected."}</p>
          </div>
          {draft.task_kind === "custom_driver" && <div className="space-y-3 sm:col-span-2">
            <div className="flex flex-wrap items-end justify-between gap-2"><div><Label>Route stops</Label><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Add collections or deliveries in visit order. Returning to the kitchen is the final step.</p></div><Button type="button" variant="outline" onClick={addStop} disabled={draft.stops.length >= 20} className="h-11"><Plus className="mr-2 h-4 w-4" />Add stop</Button></div>
            <div className="space-y-3">{draft.stops.map((stop, index) => <div key={index} className="grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/50 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-2 sm:col-span-2"><p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100"><MapPin className="h-4 w-4 text-brand-primary" />Stop {index + 1}</p><Button type="button" variant="ghost" size="icon" aria-label={`Remove stop ${index + 1}`} title={`Remove stop ${index + 1}`} onClick={() => removeStop(index)} disabled={draft.stops.length <= 1} className="h-10 w-10"><X className="h-4 w-4" /></Button></div>
              <div><Label htmlFor={`driver-stop-type-${index}`}>Stop type</Label><select id={`driver-stop-type-${index}`} value={stop.stop_type} onChange={(event) => updateStop(index, { stop_type: event.target.value as DriverStopDraft["stop_type"] })} className="mt-1.5 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-900 sm:text-sm"><option value="collection">Collect from</option><option value="delivery">Deliver to</option><option value="other">Other stop</option></select></div>
              <div className="min-w-0"><Label htmlFor={`driver-stop-name-${index}`}>Supplier or stop name</Label><SupplierPlaceAutocomplete id={`driver-stop-name-${index}`} value={stop.stop_name} onChange={(value) => updateStop(index, { stop_name: value, address: "" })} onSelect={(place) => updateStop(index, { stop_name: place.name.slice(0, 140), address: place.address.slice(0, 500) })} placeholder="Search Google Places or enter a supplier" /></div>
              <div className="min-w-0 sm:col-span-2"><Label htmlFor={`driver-stop-address-${index}`}>Address</Label><AddressAutocomplete id={`driver-stop-address-${index}`} value={stop.address} onChange={(pick) => updateStop(index, { address: pick.address.slice(0, 500) })} placeholder="Search Google Places or enter an address" className="mt-1.5" suppressNoKeyWarning /><p className="mt-1 text-xs leading-4 text-slate-500 dark:text-slate-400">Choose a suggested address or enter it manually.</p></div>
              <div className="sm:col-span-2"><Label htmlFor={`driver-stop-instructions-${index}`}>Stop instructions (optional)</Label><Input id={`driver-stop-instructions-${index}`} value={stop.instructions} onChange={(event) => updateStop(index, { instructions: event.target.value })} maxLength={1000} placeholder="Collection reference, entrance, or contact details" className="mt-1.5 h-11 w-full" /></div>
            </div>)}</div>
            {!routeStopsValid && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">Enter a supplier or stop name and an address for every stop.</p>}
            <p className="text-xs text-slate-500 dark:text-slate-400">Up to 20 stops. Drivers start the route timer, report arrival and completion at each stop, then finish when back at the kitchen.</p>
          </div>}
          <div className="min-w-0 sm:col-span-2"><Label htmlFor="one-off-instructions">Instructions (optional)</Label><textarea id="one-off-instructions" value={draft.description} onChange={(event) => update("description", event.target.value)} maxLength={2000} rows={3} placeholder="Add any details the team needs to complete the task." className="mt-1.5 min-h-24 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-base leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 dark:border-slate-700 dark:bg-slate-900 sm:text-sm" /></div>
          <div className="min-w-0"><Label htmlFor="one-off-reminder">Reminder lead time</Label><ReminderSelect id="one-off-reminder" value={draft.notify_before_hours} onChange={(hours) => update("notify_before_hours", hours)} /></div>
          <div className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-center justify-between gap-3"><Label htmlFor="one-off-notify-staff" className="cursor-pointer">Notify assigned team in app</Label><Switch id="one-off-notify-staff" checked={draft.notify_staff} onCheckedChange={(checked) => update("notify_staff", checked)} aria-label="Notify assigned team in app" /></div>
            <div className="flex items-center justify-between gap-3"><Label htmlFor="one-off-notify-admins" className="cursor-pointer">Notify admins in app too</Label><Switch id="one-off-notify-admins" checked={draft.notify_admins} onCheckedChange={(checked) => update("notify_admins", checked)} aria-label="Notify admins in app too" /></div>
          </div>
          <p className="text-xs leading-5 text-slate-500 sm:col-span-2">WhatsApp can send this reminder at the same lead time. Configure the <Link href={withSlug("/admin/whatsapp?message=whatsapp_staff_task_assigned#wa-message-library")} className="font-medium text-brand-primary underline underline-offset-2">One-off task reminder</Link> template before creating the task. It follows these team/admin notification switches and skips people who opted out or have no mobile number.</p>
        </div>
        <div className="flex justify-end"><Button type="submit" disabled={creating || !draft.title.trim() || !draft.task_date || !draft.scheduled_time || !routeStopsValid} className="h-11 bg-brand-primary text-white hover:bg-brand-primary/90">{creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking roster</> : draft.task_kind === "custom_driver" ? <><Truck className="mr-2 h-4 w-4" />Create driver route</> : "Create task"}</Button></div>
      </form>
    </PortalCard>
  );
}

function DailyOperationsPageInner() {
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const [settings, setSettings] = useState<DailyOperationsSettings>(DAILY_OPERATIONS_DEFAULTS);
  const [tasks, setTasks] = useState<DailyOperationsTask[]>([]);
  const [staff, setStaff] = useState<DailyOperationsStaff[]>([]);
  const [driverIds, setDriverIds] = useState<Set<string>>(new Set());
  const [kitchenIds, setKitchenIds] = useState<Set<string>>(new Set());
  const [cleaningIds, setCleaningIds] = useState<Set<string>>(new Set());
  const [companyTimezone, setCompanyTimezone] = useState(DEFAULT_TENANT_TIMEZONE);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  const hasInvalidWeekdaySchedule = (
    settings.kitchen_cleaning_schedule_mode === "selected_weekdays" && settings.kitchen_cleaning_weekdays.length === 0
  ) || (
    settings.equipment_cleaning_schedule_mode === "selected_weekdays" && settings.equipment_cleaning_weekdays.length === 0
  );
  const hasInvalidTaskTitle = !settings.kitchen_cleaning_title.trim() || !settings.equipment_cleaning_title.trim();

  const load = async () => {
    if (!user?.company_id) return;
    try {
      const [loadedSettings, taskResult, staffResult, companyResult] = await Promise.all([
        getDailyOperationsSettings(user.company_id),
        (supabase as any).from("daily_operations_tasks").select("*").eq("company_id", user.company_id).gte("task_date", offsetIsoDay(toZonedISO(new Date(), "UTC"), -1)).in("status", ["scheduled", "in_progress"]).order("task_date", { ascending: true }).order("scheduled_time", { ascending: true }).limit(50),
        (supabase as any).from("profiles").select("id, full_name, email, role, active_role").eq("company_id", user.company_id).neq("is_active", false).is("deleted_at", null).order("full_name", { ascending: true }),
        (supabase as any).from("companies").select("timezone").eq("id", user.company_id).maybeSingle(),
      ]);
      if (taskResult.error) throw taskResult.error;
      if (staffResult.error) throw staffResult.error;
      setSettings(loadedSettings);
      const staffRows = (staffResult.data || []) as DailyOperationsStaff[];
      const staffIds = staffRows.map((profile) => profile.id).filter(Boolean);
      let departmentRows: Array<{ user_id: string | null; department: string | null }> = [];
      if (staffIds.length) {
        const { data, error } = await (supabase as any).from("user_departments")
          .select("user_id, department")
          .in("user_id", staffIds);
        if (error) throw error;
        departmentRows = (data || []) as Array<{ user_id: string | null; department: string | null }>;
      }
      const departmentsByUser = new Map<string, string[]>();
      for (const row of departmentRows) {
        if (!row.user_id || !row.department) continue;
        departmentsByUser.set(row.user_id, [...(departmentsByUser.get(row.user_id) || []), row.department]);
      }
      setStaff(staffRows.map((profile) => ({ ...profile, departments: departmentsByUser.get(profile.id) || [] })));
      setDriverIds(new Set(filterRosterStaff(staffRows, departmentRows, "driver").map((profile) => profile.id)));
      setKitchenIds(new Set(filterRosterStaff(staffRows, departmentRows, "kitchen").map((profile) => profile.id)));
      setCleaningIds(new Set(filterRosterStaff(staffRows, departmentRows, "cleaning").map((profile) => profile.id)));
      if (!companyResult.error && companyResult.data?.timezone) setCompanyTimezone(companyResult.data.timezone);
      const routeTaskIds = ((taskResult.data || []) as DailyOperationsTask[]).filter((task) => task.task_kind === "custom_driver").map((task) => task.id);
      const stopsByTask = new Map<string, any[]>();
      if (routeTaskIds.length) {
        const { data: stops, error: stopError } = await (supabase as any).from("daily_operation_driver_task_stops").select("*").eq("company_id", user.company_id).in("task_id", routeTaskIds).order("stop_number", { ascending: true });
        if (!stopError) {
          for (const stop of stops || []) stopsByTask.set(stop.task_id, [...(stopsByTask.get(stop.task_id) || []), stop]);
        } else console.warn("[DailyOperationsPage] route stops are unavailable until the route update is installed:", stopError.message);
      }
      setTasks(((taskResult.data || []) as DailyOperationsTask[]).map((task) => ({
        ...task,
        driver_stops: stopsByTask.get(task.id) || [],
        title: task.task_kind === "kitchen_cleaning" || task.task_kind === "equipment_cleaning"
          ? cleanDailyOperationsTaskTitle(task.task_kind, task.title)
          : task.title,
      })));
    } catch (error: any) {
      toast({ title: "Could not load daily operations", description: error?.message || "Check your connection and retry.", variant: "destructive" });
    } finally { setLoaded(true); }
  };

  useEffect(() => { void load(); }, [user?.company_id]);

  const createOneOffTask = async (draft: OneOffTaskDraft): Promise<boolean> => {
    if (!user?.company_id || creatingTask) return false;
    setCreatingTask(true);
    try {
      if (draft.task_date < toZonedISO(new Date(), companyTimezone)) {
        toast({ title: "Choose today or a future date", description: "Tasks can't be scheduled for a date that has already passed in your company timezone.", variant: "destructive" });
        return false;
      }
      const shiftTypes = shiftTypesForOneOffTask(draft.task_kind);
      const { data: roster, error: rosterError } = await (supabase as any)
        .from("kitchen_shifts")
        .select("id, staff_id, shift_type, planned_start, planned_end, status")
        .eq("company_id", user.company_id)
        .eq("shift_date", draft.task_date)
        .in("shift_type", shiftTypes)
        .in("status", ["scheduled", "active"])
        .is("deleted_at", null);
      if (rosterError) {
        toast({ title: "Could not check the roster", description: "Nothing was created. Check the roster connection and try again.", variant: "destructive" });
        return false;
      }
      const atTaskTime = ((roster || []) as Array<{ staff_id: string | null; shift_type: string; planned_start: string | null; planned_end: string | null; status: string }>).filter((shift) => {
        if (!shiftCoversTaskTime(shift, draft.scheduled_time) || !shift.staff_id) return false;
        if (draft.task_kind === "custom_driver") return driverIds.has(shift.staff_id);
        if (shift.shift_type === "kitchen") return draft.task_kind !== "custom_cleaning" && kitchenIds.has(shift.staff_id);
        if (shift.shift_type === "cleaning") return draft.task_kind !== "custom_kitchen" && cleaningIds.has(shift.staff_id);
        if (shift.shift_type === "kitchen_and_cleaning") {
          return (draft.task_kind !== "custom_cleaning" && kitchenIds.has(shift.staff_id)
            || draft.task_kind !== "custom_kitchen" && cleaningIds.has(shift.staff_id));
        }
        return false;
      });
      if (atTaskTime.length === 0) {
        const dateLabel = new Date(`${draft.task_date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
        const timeLabel = formatClock(draft.scheduled_time);
        const teamLabel = draft.task_kind === "custom_kitchen" ? "Kitchen staff"
          : draft.task_kind === "custom_cleaning" ? "Cleaning staff"
            : draft.task_kind === "custom_driver" ? "Drivers" : "Kitchen or cleaning staff";
        toast({
          title: "No roster coverage for this time",
          description: `No ${teamLabel.toLowerCase()} are scheduled at ${timeLabel} on ${dateLabel}. Nothing was created; add a matching shift to the roster or choose a time when the team is working.`,
          variant: "destructive",
        });
        return false;
      }

      if (draft.task_kind === "custom_driver") {
        const { error } = await (supabase as any).rpc("create_daily_operation_driver_task", {
          p_task_date: draft.task_date,
          p_scheduled_time: draft.scheduled_time,
          p_title: draft.title,
          p_description: draft.description || null,
          p_notify_before_hours: draft.notify_before_hours,
          p_notify_staff: draft.notify_staff,
          p_notify_admins: draft.notify_admins,
          p_stops: draft.stops.map((stop) => ({
            stop_type: stop.stop_type,
            stop_name: stop.stop_name.trim(),
            address: stop.address.trim(),
            instructions: stop.instructions.trim() || null,
          })),
        });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).rpc("create_daily_operation_task", {
          p_task_kind: draft.task_kind,
          p_task_date: draft.task_date,
          p_scheduled_time: draft.scheduled_time,
          p_title: draft.title,
          p_description: draft.description || null,
          p_notify_before_hours: draft.notify_before_hours,
          p_notify_staff: draft.notify_staff,
          p_notify_admins: draft.notify_admins,
        });
        if (error) throw error;
      }
      toast({ title: draft.task_kind === "custom_driver" ? "Driver route scheduled" : "Task added to the dashboard", description: `${draft.title} is scheduled for ${draft.task_date} at ${formatClock(draft.scheduled_time)}.` });
      await load();
      return true;
    } catch (error: any) {
      const message = String(error?.message || "");
      const schemaMissing = /schema cache|column .* does not exist|PGRST20[24]|function .* does not exist/i.test(message);
      toast({ title: "Could not create task", description: schemaMissing ? "The one-off task update is not installed in the database yet. Apply the latest database update, then retry." : message || "Check the task details and try again.", variant: "destructive" });
      return false;
    } finally { setCreatingTask(false); }
  };

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

  const companyToday = toZonedISO(new Date(), companyTimezone);
  const openTasks = useMemo(() => tasks.filter((task) => task.task_date >= companyToday && (task.status === "scheduled" || task.status === "in_progress")), [tasks, companyToday]);
  return (
    <>
      <Head><title>Daily operations - CateringMS</title></Head>
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell>
          <PortalHeader variant="hero" title="Daily operations" subtitle="Set recurring cleaning schedules or add a kitchen, cleaning or driver task for a specific date." icon={Settings2} actions={<Button onClick={() => void save()} disabled={!loaded || saving || hasInvalidWeekdaySchedule || hasInvalidTaskTitle} className="bg-white text-slate-900 hover:bg-white/90">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving</> : <><Save className="mr-2 h-4 w-4" />Save schedules</>}</Button>} meta={<><span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"><Clock3 className="h-3 w-3" />Company timezone</span><span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"><Bell className="h-3 w-3" />Checks every 15 min</span></>} />
          <PageWorkbench />
          {!loaded ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : <div className="space-y-4">
            <PortalCard className="border-brand-primary/20 bg-brand-primary/5 dark:bg-brand-primary/10"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><Bell className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" /><div><h2 className="font-semibold text-slate-900 dark:text-white">Schedule rules</h2><p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">Recurring tasks can follow the roster, selected weekdays, or run every day. Roster-based tasks are created only when the assigned team has a shift at the task time. In-app reminders can be sent up to three days ahead.</p></div></div><div className="flex shrink-0 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"><Label htmlFor="notify-recurring-admins" className="cursor-pointer text-sm">Notify admins in app too</Label><Switch id="notify-recurring-admins" checked={settings.admin_notifications_enabled} onCheckedChange={(checked) => setSettings((current) => ({ ...current, admin_notifications_enabled: checked }))} aria-label="Notify admins for recurring task reminders" /></div></div></PortalCard>
            <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
              <ScheduleCard kind="kitchen" settings={settings} setSettings={setSettings} staff={staff} />
              <ScheduleCard kind="equipment" settings={settings} setSettings={setSettings} staff={staff} />
            </div>
            <OneOffTaskForm creating={creatingTask} today={toZonedISO(new Date(), companyTimezone)} onCreate={createOneOffTask} />
            <PortalCard className="min-w-0"><div className="mb-4 flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="font-semibold text-slate-900 dark:text-white">Upcoming tasks</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Open recurring and one-off work on the kitchen, cleaning or driver dashboards.</p></div><Users className="h-5 w-5 shrink-0 text-slate-400" /></div>{openTasks.length === 0 ? <p className="py-5 text-sm leading-5 text-slate-500 dark:text-slate-400">No upcoming tasks. One-off tasks will appear here after they are created.</p> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{openTasks.map((task) => {
              const taskTeam = dashboardLabelForRoles(task.visible_roles?.length ? task.visible_roles : task.target_roles);
              const assignee = task.assigned_to ? staff.find((member) => member.id === task.assigned_to) : null;
              const actionTeam = dashboardLabelForRoles(task.target_roles);
              const routeStops = task.driver_stops || [];
              const routeStage = task.route_stage?.replace(/_/g, " ") || "ready to start";
              return <div key={task.id} className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"><div className="min-w-0"><p className="break-words font-medium text-slate-900 dark:text-white">{task.title}</p><p className="text-xs text-slate-500 dark:text-slate-400">{new Date(`${task.task_date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} at {formatClock(task.scheduled_time)} · {task.status.replace("_", " ")}</p>{task.task_kind === "custom_driver" && <p className="mt-1 break-words text-xs leading-5 text-slate-600 dark:text-slate-400">Route: {routeStage}{routeStops.length ? ` · ${routeStops.length} stops: ${routeStops.map((stop) => `${stop.stop_number}. ${stop.stop_name}`).join(" → ")}` : ""}</p>}</div><div className="flex min-w-0 flex-col items-start gap-1 sm:items-end"><span className="inline-flex min-w-0 items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" /><span className="break-words">Visible on {taskTeam}</span></span><span className="text-xs text-slate-500 dark:text-slate-400">{assignee ? `Claimed by ${staffLabel(assignee)}` : `Available to ${actionTeam} team`}</span></div></div>;
            })}</div>}</PortalCard>
          </div>}
        </PortalShell>
      </div>
    </>
  );
}

export default function DailyOperationsPage() {
  return <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}><DailyOperationsPageInner /></ProtectedRoute>;
}

