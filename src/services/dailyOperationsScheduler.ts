/* eslint-disable @typescript-eslint/no-explicit-any */
import { getServiceSupabase } from "@/lib/supabase/service";
import { cleanDailyOperationsTaskTitle } from "@/lib/dailyOperationsCopy";
import { toZonedISO, DEFAULT_TENANT_TIMEZONE } from "@/lib/localDate";

const TASK_LINK = "/team-portal/cleaning/tasks";
const ADMIN_LINK = "/admin/daily-operations";
type Target = "kitchen" | "cleaning" | "both";
type ScheduleMode = "every_day" | "selected_weekdays" | "staff_scheduled";
const AUTO_SKIP_PREFIX = "[cleaning task schedule] ";

function localParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { hour: get("hour"), minute: get("minute") };
}

function targetRoles(target: Target): string[] {
  if (target === "kitchen") return ["kitchen_staff", "kitchen_manager"];
  if (target === "cleaning") return ["cleaning_staff", "cleaning_manager"];
  return ["kitchen_staff", "kitchen_manager", "cleaning_staff", "cleaning_manager"];
}

function minutesForTime(value: string | null | undefined): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  if (!match) return 0;
  return Math.max(0, Math.min(1439, Number(match[1]) * 60 + Number(match[2])));
}

function humanTime(value: string): string {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function isSelectedWeekday(taskDate: string, weekdays: number[]): boolean {
  const weekday = new Date(`${taskDate}T00:00:00.000Z`).getUTCDay();
  return weekdays.includes(weekday);
}

function shiftTypesForTarget(target: Target): string[] {
  if (target === "kitchen") return ["kitchen", "kitchen_and_cleaning"];
  if (target === "cleaning") return ["cleaning", "kitchen_and_cleaning"];
  return ["kitchen", "cleaning", "kitchen_and_cleaning"];
}

async function hasScheduledStaff(sb: any, companyId: string, taskDate: string, target: Target): Promise<boolean> {
  const { data, error } = await sb
    .from("kitchen_shifts")
    .select("id")
    .eq("company_id", companyId)
    .eq("shift_date", taskDate)
    .in("shift_type", shiftTypesForTarget(target))
    .neq("status", "cancelled")
    .is("deleted_at", null)
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

async function suppressPendingTask(sb: any, companyId: string, taskKind: string, taskDate: string, reason: string) {
  const { data: existing, error } = await sb
    .from("daily_operations_tasks")
    .select("id, status, staff_notified_at")
    .eq("company_id", companyId)
    .eq("task_kind", taskKind)
    .eq("task_date", taskDate)
    .maybeSingle();
  if (error) throw error;
  if (!existing || existing.status !== "scheduled" || existing.staff_notified_at) return;
  const { error: updateError } = await sb
    .from("daily_operations_tasks")
    .update({ status: "skipped", notes: `${AUTO_SKIP_PREFIX}${reason}` })
    .eq("id", existing.id)
    .eq("status", "scheduled")
    .is("staff_notified_at", null);
  if (updateError) throw updateError;
}

async function reviveAutomaticallySkippedTask(sb: any, task: any): Promise<any> {
  if (task?.status !== "skipped" || !String(task.notes || "").startsWith(AUTO_SKIP_PREFIX) || task.staff_notified_at) return task;
  const { error } = await sb
    .from("daily_operations_tasks")
    .update({ status: "scheduled", notes: null })
    .eq("id", task.id)
    .eq("status", "skipped")
    .is("staff_notified_at", null);
  if (error) throw error;
  return { ...task, status: "scheduled", notes: null };
}

async function notifyUsers(sb: any, userIds: string[], payload: Record<string, any>) {
  if (!userIds.length) return 0;
  // Route scheduled kitchen/cleaning reminders through the same service as
  // ordinary assignments. The old bulk insert created only an in-app row,
  // so task_assigned email preferences and email delivery were bypassed.
  const { notificationService } = await import("@/services/notificationService");
  await Promise.all(userIds.map((id) => notificationService.createNotification({
    company_id: payload.company_id,
    user_id: id,
    recipient_id: id,
    notification_type: "daily_operations_task",
    title: payload.title,
    message: payload.message,
    priority: payload.priority || "normal",
    link: payload.link || TASK_LINK,
    related_entity_type: "daily_operations_task",
    related_entity_id: payload.task_id,
  }, sb)));
  return userIds.length;
}

async function notifyTask(sb: any, task: any, companyId: string, adminNotifications: boolean) {
  const roles = new Set((task.target_roles || []) as string[]);
  const { data: profiles, error } = await sb
    .from("profiles")
    .select("id, role, active_role")
    .eq("company_id", companyId)
    .eq("is_active", true);
  if (error) throw error;

  const staff = (profiles || []).filter((p: any) => {
    const active = String(p.active_role || p.role || "");
    return roles.has(active) || roles.has(String(p.role || ""));
  });
  const staffIds = Array.from(new Set(staff.map((p: any) => p.id))) as string[];
  const nowLabel = humanTime(String(task.scheduled_time));
  const dateLabel = new Date(`${task.task_date}T00:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  const staffCount = await notifyUsers(sb, staffIds, {
    company_id: companyId,
    task_id: task.id,
    title: `Cleaning task: ${task.title}`,
    message: `${task.title} is scheduled for ${dateLabel} at ${nowLabel}. ${task.description || "Open the task board to start it."}`,
    link: TASK_LINK,
  });

  let adminCount = 0;
  if (adminNotifications) {
    const admins = (profiles || []).filter((p: any) =>
      ["super_admin", "owner", "company_admin", "admin"].includes(String(p.active_role || p.role || "")),
    );
    adminCount = await notifyUsers(sb, Array.from(new Set(admins.map((p: any) => p.id))), {
      company_id: companyId,
      task_id: task.id,
      title: `Cleaning task scheduled: ${task.title}`,
      message: `${task.title} is scheduled for ${dateLabel} at ${nowLabel}. Staff will be reminded according to the configured lead time.`,
      link: ADMIN_LINK,
    });
  }
  return { staffCount, adminCount };
}

export async function runDailyOperationsScheduler(now = new Date(), client?: any) {
  const sb = client || getServiceSupabase();
  const { data: settingsRows, error } = await sb
    .from("company_daily_operations_settings")
    .select("*, company:companies(id, timezone)");
  if (error) throw error;

  const summary = { companies: 0, tasksCreated: 0, staffNotifications: 0, adminNotifications: 0, errors: [] as string[] };
  for (const row of (settingsRows || []) as any[]) {
    const companyId = row.company_id as string;
    const timezone = row.company?.timezone || DEFAULT_TENANT_TIMEZONE;
    const parts = localParts(now, timezone);
    const taskDate = toZonedISO(now, timezone);
    const currentMinutes = parts.hour * 60 + parts.minute;
    summary.companies += 1;
    const definitions = [
      { kind: "kitchen_cleaning", enabled: row.kitchen_cleaning_enabled, time: row.kitchen_cleaning_time, title: cleanDailyOperationsTaskTitle("kitchen_cleaning", String(row.kitchen_cleaning_title || "Kitchen area cleaning")), description: row.kitchen_cleaning_description, lead: Number(row.kitchen_cleaning_lead_hours || 0), target: (row.kitchen_cleaning_target || "kitchen") as Target, scheduleMode: (row.kitchen_cleaning_schedule_mode || "staff_scheduled") as ScheduleMode, weekdays: (row.kitchen_cleaning_weekdays || [0, 1, 2, 3, 4, 5, 6]) as number[] },
      { kind: "equipment_cleaning", enabled: row.equipment_cleaning_enabled, time: row.equipment_cleaning_time, title: cleanDailyOperationsTaskTitle("equipment_cleaning", String(row.equipment_cleaning_title || "Kitchen equipment cleaning")), description: row.equipment_cleaning_description, lead: Number(row.equipment_cleaning_lead_hours || 0), target: (row.equipment_cleaning_target || "cleaning") as Target, scheduleMode: (row.equipment_cleaning_schedule_mode || "staff_scheduled") as ScheduleMode, weekdays: (row.equipment_cleaning_weekdays || [0, 1, 2, 3, 4, 5, 6]) as number[] },
    ];

    for (const definition of definitions) {
      if (!definition.enabled) continue;
      try {
        if (definition.scheduleMode === "selected_weekdays" && !isSelectedWeekday(taskDate, definition.weekdays)) {
          await suppressPendingTask(sb, companyId, definition.kind, taskDate, "This weekday is not selected.");
          continue;
        }
        if (definition.scheduleMode === "staff_scheduled" && !(await hasScheduledStaff(sb, companyId, taskDate, definition.target))) {
          await suppressPendingTask(sb, companyId, definition.kind, taskDate, "No matching team shift is scheduled.");
          continue;
        }
        const taskPayload = {
          company_id: companyId,
          task_kind: definition.kind,
          task_date: taskDate,
          scheduled_time: String(definition.time).slice(0, 5),
          title: definition.title,
          description: definition.description,
          target_roles: targetRoles(definition.target || (definition.kind === "equipment_cleaning" ? "cleaning" : "kitchen")),
          status: "scheduled",
        };
        const { error: upsertError } = await sb
          .from("daily_operations_tasks")
          .upsert(taskPayload, { onConflict: "company_id,task_kind,task_date", ignoreDuplicates: true });
        if (upsertError) throw upsertError;
        const { data: taskRow, error: readError } = await sb
          .from("daily_operations_tasks")
          .select("*")
          .eq("company_id", companyId)
          .eq("task_kind", definition.kind)
          .eq("task_date", taskDate)
          .maybeSingle();
        if (readError) throw readError;
        if (!taskRow) continue;
        const task = await reviveAutomaticallySkippedTask(sb, taskRow);
        if (task.status === "skipped") continue;
        summary.tasksCreated += 1;
        const scheduledMinutes = minutesForTime(task.scheduled_time);
        const dueForStaff = currentMinutes >= scheduledMinutes - Math.round(definition.lead * 60);
        if (dueForStaff && !task.staff_notified_at) {
          const notified = await notifyTask(sb, task, companyId, Boolean(row.admin_notifications_enabled));
          await sb.from("daily_operations_tasks").update({
            staff_notified_at: now.toISOString(),
            admin_notified_at: notified.adminCount ? now.toISOString() : task.admin_notified_at,
          }).eq("id", task.id).is("staff_notified_at", null);
          summary.staffNotifications += notified.staffCount;
          summary.adminNotifications += notified.adminCount;
        }
      } catch (e: any) {
        summary.errors.push(`${companyId}/${definition.kind}: ${e?.message || String(e)}`);
      }
    }
  }
  return summary;
}
