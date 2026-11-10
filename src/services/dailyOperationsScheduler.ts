/* eslint-disable @typescript-eslint/no-explicit-any */
import { getServiceSupabase } from "@/lib/supabase/service";
import { cleanDailyOperationsTaskTitle } from "@/lib/dailyOperationsCopy";
import { toZonedISO, DEFAULT_TENANT_TIMEZONE } from "@/lib/localDate";
import { oneOffTaskNotificationLabel, type OneOffTaskKind } from "@/lib/dailyOperationsTaskTargets";

const ADMIN_LINK = "/admin/daily-operations";
type Target = "kitchen" | "cleaning" | "both";
type ScheduleMode = "every_day" | "selected_weekdays" | "staff_scheduled";
const AUTO_SKIP_PREFIX = "[cleaning task schedule] ";

function targetRoles(target: Target): string[] {
  if (target === "kitchen") return ["kitchen_staff", "kitchen_manager"];
  if (target === "cleaning") return ["cleaning_staff", "cleaning_manager"];
  return ["kitchen_staff", "kitchen_manager", "cleaning_staff", "cleaning_manager"];
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

function addDays(taskDate: string, days: number): string {
  const date = new Date(`${taskDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function zonedTaskInstant(taskDate: string, time: string, timezone: string): Date {
  const [year, month, day] = taskDate.split("-").map(Number);
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = desiredUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
    const representedUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    guess += desiredUtc - representedUtc;
  }
  return new Date(guess);
}

function taskDateLabel(taskDate: string): string {
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${taskDate}T00:00:00.000Z`));
}

function shiftTypesForTarget(target: Target): string[] {
  if (target === "kitchen") return ["kitchen", "kitchen_and_cleaning"];
  if (target === "cleaning") return ["cleaning", "kitchen_and_cleaning"];
  return ["kitchen", "cleaning", "kitchen_and_cleaning"];
}

function shiftCoversTime(shift: { planned_start?: string | null; planned_end?: string | null }, taskTime: string): boolean {
  const minuteValue = (value: string | null | undefined) => {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null;
  };
  const start = minuteValue(shift.planned_start);
  const end = minuteValue(shift.planned_end);
  const task = minuteValue(taskTime);
  if (start === null || end === null || task === null) return false;
  return end >= start ? task >= start && task <= end : task >= start || task <= end;
}

async function hasScheduledStaff(sb: any, companyId: string, taskDate: string, target: Target, taskTime: string, assignedTo: string | null): Promise<boolean> {
  let query = sb
    .from("kitchen_shifts")
    .select("id, staff_id, planned_start, planned_end")
    .eq("company_id", companyId)
    .eq("shift_date", taskDate)
    .in("shift_type", shiftTypesForTarget(target))
    .in("status", ["scheduled", "active"])
    .is("deleted_at", null);
  if (assignedTo) query = query.eq("staff_id", assignedTo);
  const { data, error } = await query.limit(100);
  if (error) throw error;
  const shifts = assignedTo ? (data || []).filter((shift: any) => shift.staff_id === assignedTo) : (data || []);
  return shifts.some((shift: any) => shiftCoversTime(shift, taskTime));
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

async function notifyUsers(sb: any, profiles: any[], payload: Record<string, any>) {
  if (!profiles.length) return 0;
  // Route scheduled kitchen/cleaning reminders through the same service as
  // ordinary assignments. The old bulk insert created only an in-app row,
  // so task_assigned email preferences and email delivery were bypassed.
  const { notificationService } = await import("@/services/notificationService");
  await Promise.all(profiles.map((profile) => {
    const role = String(profile.active_role || profile.role || "");
    const profileRoles = [role, String(profile.role || ""), ...(profile.departments || [])];
    const link = profileRoles.some((value) => value === "driver") ? "/team-portal/driver/dashboard"
      : profileRoles.some((value) => value.startsWith("kitchen")) ? "/team-portal/kitchen/today" : "/team-portal/cleaning/tasks";
    return notificationService.createNotification({
    company_id: payload.company_id,
    user_id: profile.id,
    recipient_id: profile.id,
    notification_type: "daily_operations_task",
    title: payload.title,
    message: payload.message,
    priority: payload.priority || "normal",
    link: (typeof payload.linkForProfile === "function" ? payload.linkForProfile(profile) : null) || payload.link || link,
    related_entity_type: "daily_operations_task",
    related_entity_id: payload.task_id,
    dedup: true,
    dedupWindowMinutes: 72 * 60,
  }, sb);
  }));
  return profiles.length;
}

async function notifyTask(sb: any, task: any, companyId: string, options: { notifyStaff: boolean; notifyAdmins: boolean }) {
  const roles = new Set((task.target_roles || []) as string[]);
  const { data: profiles, error } = await sb
    .from("profiles")
    .select("id, role, active_role")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .is("deleted_at", null);
  if (error) throw error;

  const profileIds = (profiles || []).map((profile: any) => profile.id).filter(Boolean);
  let departmentRows: Array<{ user_id: string | null; department: string | null }> = [];
  if (profileIds.length) {
    const { data, error: departmentError } = await sb
      .from("user_departments")
      .select("user_id, department")
      .in("user_id", profileIds);
    if (departmentError) throw departmentError;
    departmentRows = data || [];
  }
  const departmentsByUser = new Map<string, string[]>();
  for (const row of departmentRows || []) {
    if (!row.user_id || !row.department) continue;
    departmentsByUser.set(row.user_id, [...(departmentsByUser.get(row.user_id) || []), String(row.department)]);
  }

  const staff = (profiles || []).filter((p: any) => {
    const assignedMatch = !task.assigned_to || p.id === task.assigned_to;
    const profileRoles = [String(p.role || ""), ...(departmentsByUser.get(p.id) || [])];
    const expandedRoles = profileRoles.flatMap((role) => role === "kitchen" ? ["kitchen", "kitchen_staff", "kitchen_manager"]
      : role === "cleaning" ? ["cleaning", "cleaning_staff", "cleaning_manager"]
        : role === "driver_staff" ? ["driver", "driver_staff"] : [role]);
    return assignedMatch && (Boolean(task.assigned_to) || expandedRoles.some((role) => roles.has(role)));
  });
  const staffWithDepartments = staff.map((profile: any) => ({
    ...profile,
    departments: departmentsByUser.get(profile.id) || [],
  }));
  const workerTaskLink = (profile: any) => {
    if (task.task_kind === "custom_driver") return "/team-portal/driver/dashboard";
    const profileRoles = [String(profile.role || ""), ...(profile.departments || [])];
    const assignedRoles = new Set(profileRoles.flatMap((role) => role === "kitchen" ? ["kitchen", "kitchen_staff", "kitchen_manager"]
      : role === "cleaning" ? ["cleaning", "cleaning_staff", "cleaning_manager"]
        : role === "driver_staff" ? ["driver", "driver_staff"] : [role]));
    const targetRoles = (task.target_roles || []) as string[];
    const activeRole = String(profile.active_role || "");
    const preferredRole = assignedRoles.has(activeRole) && targetRoles.includes(activeRole) ? activeRole : "";
    const targetRole = preferredRole || targetRoles.find((role) => assignedRoles.has(role)) || "";
    if (targetRole === "cleaning" || targetRole.startsWith("cleaning_")) return "/team-portal/cleaning/tasks";
    if (targetRole === "driver" || targetRole === "driver_staff") return "/team-portal/driver/dashboard";
    return "/team-portal/kitchen/today";
  };
  const nowLabel = humanTime(String(task.scheduled_time));
  const dateLabel = taskDateLabel(String(task.task_date));
  const taskLabel = String(task.task_kind).startsWith("custom_")
    ? oneOffTaskNotificationLabel(task.task_kind as OneOffTaskKind)
    : task.task_kind === "kitchen_cleaning" ? "Kitchen task" : "Cleaning task";
  const staffCount = options.notifyStaff ? await notifyUsers(sb, staffWithDepartments, {
    company_id: companyId,
    task_id: task.id,
    title: `${taskLabel}: ${task.title}`,
    message: `${task.title} is scheduled for ${dateLabel} at ${nowLabel}. ${task.description || "Open the task board to start it."}`,
    linkForProfile: workerTaskLink,
  }) : 0;

  let adminCount = 0;
  if (options.notifyAdmins) {
    const adminRoles = new Set(["super_admin", "owner", "company_admin", "admin"]);
    const admins = (profiles || []).filter((p: any) => adminRoles.has(String(p.role || ""))
      || (departmentsByUser.get(p.id) || []).some((role) => adminRoles.has(role)));
    adminCount = await notifyUsers(sb, Array.from(new Map(admins.map((p: any) => [p.id, p])).values()), {
      company_id: companyId,
      task_id: task.id,
      title: `${taskLabel} scheduled: ${task.title}`,
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
    const taskDate = toZonedISO(now, timezone);
    summary.companies += 1;
    const definitions = [
      { kind: "kitchen_cleaning", enabled: row.kitchen_cleaning_enabled, time: row.kitchen_cleaning_time, title: cleanDailyOperationsTaskTitle("kitchen_cleaning", String(row.kitchen_cleaning_title || "Kitchen area cleaning")), description: row.kitchen_cleaning_description, lead: Number(row.kitchen_cleaning_lead_hours || 0), target: (row.kitchen_cleaning_target || "kitchen") as Target, assignedTo: row.kitchen_cleaning_assigned_to || null, scheduleMode: (row.kitchen_cleaning_schedule_mode || "staff_scheduled") as ScheduleMode, weekdays: (row.kitchen_cleaning_weekdays || [0, 1, 2, 3, 4, 5, 6]) as number[] },
      { kind: "equipment_cleaning", enabled: row.equipment_cleaning_enabled, time: row.equipment_cleaning_time, title: cleanDailyOperationsTaskTitle("equipment_cleaning", String(row.equipment_cleaning_title || "Kitchen equipment cleaning")), description: row.equipment_cleaning_description, lead: Number(row.equipment_cleaning_lead_hours || 0), target: (row.equipment_cleaning_target || "cleaning") as Target, assignedTo: row.equipment_cleaning_assigned_to || null, scheduleMode: (row.equipment_cleaning_schedule_mode || "staff_scheduled") as ScheduleMode, weekdays: (row.equipment_cleaning_weekdays || [0, 1, 2, 3, 4, 5, 6]) as number[] },
    ];

    for (const definition of definitions) {
      const daysAhead = Math.max(1, Math.ceil(definition.lead / 24));
      try {
        if (!definition.enabled) {
          for (let offset = 0; offset <= 3; offset += 1) {
            await suppressPendingTask(sb, companyId, definition.kind, addDays(taskDate, offset), "This task is disabled.");
          }
          continue;
        }
        for (let offset = 0; offset <= 3; offset += 1) {
          const date = addDays(taskDate, offset);
          if (offset > daysAhead) {
            await suppressPendingTask(sb, companyId, definition.kind, date, "This date is outside the reminder window.");
            continue;
          }
          if (definition.scheduleMode === "selected_weekdays" && !isSelectedWeekday(date, definition.weekdays)) {
            await suppressPendingTask(sb, companyId, definition.kind, date, "This weekday is not selected.");
            continue;
          }
          const scheduledTime = String(definition.time).slice(0, 5);
          if (definition.scheduleMode === "staff_scheduled" && !(await hasScheduledStaff(sb, companyId, date, definition.target, scheduledTime, definition.assignedTo))) {
            await suppressPendingTask(sb, companyId, definition.kind, date, "No matching team shift is scheduled.");
            continue;
          }
          const recurrenceKey = `${definition.kind}:${date}`;
          const taskPayload = {
            company_id: companyId,
            task_kind: definition.kind,
            task_date: date,
            recurrence_key: recurrenceKey,
            scheduled_time: scheduledTime,
            title: definition.title,
            description: definition.description,
            target_roles: targetRoles(definition.target || (definition.kind === "equipment_cleaning" ? "cleaning" : "kitchen")),
            assigned_to: definition.assignedTo,
            notify_before_hours: definition.lead,
            status: "scheduled",
          };
          const { data: existingTask, error: existingTaskError } = await sb
            .from("daily_operations_tasks")
            .select("id, status, staff_notified_at, notes")
            .eq("company_id", companyId)
            .eq("recurrence_key", recurrenceKey)
            .maybeSingle();
          if (existingTaskError) throw existingTaskError;
          if (existingTask) {
            const autoSkipped = existingTask.status === "skipped"
              && String(existingTask.notes || "").startsWith(AUTO_SKIP_PREFIX)
              && !existingTask.staff_notified_at;
            if ((existingTask.status === "scheduled" && !existingTask.staff_notified_at) || autoSkipped) {
              const { error: updateError } = await sb.from("daily_operations_tasks").update({
                scheduled_time: taskPayload.scheduled_time,
                title: taskPayload.title,
                description: taskPayload.description,
                target_roles: taskPayload.target_roles,
                assigned_to: taskPayload.assigned_to,
                notify_before_hours: taskPayload.notify_before_hours,
                ...(autoSkipped ? { status: "scheduled", notes: null } : {}),
              }).eq("id", existingTask.id).eq("status", existingTask.status).is("staff_notified_at", null);
              if (updateError) throw updateError;
            }
          } else {
            const { error: upsertError } = await sb
              .from("daily_operations_tasks")
              .upsert(taskPayload, { onConflict: "company_id,recurrence_key", ignoreDuplicates: true });
            if (upsertError) throw upsertError;
          }
          const { data: taskRow, error: readError } = await sb
            .from("daily_operations_tasks")
            .select("*")
            .eq("company_id", companyId)
            .eq("recurrence_key", recurrenceKey)
            .maybeSingle();
          if (readError) throw readError;
          if (!taskRow) continue;
          const task = await reviveAutomaticallySkippedTask(sb, taskRow);
          if (task.status === "skipped") continue;
          summary.tasksCreated += 1;
          const dueAt = zonedTaskInstant(date, scheduledTime, timezone).getTime() - definition.lead * 60 * 60 * 1000;
          if (now.getTime() >= dueAt && !task.staff_notified_at) {
            const notified = await notifyTask(sb, task, companyId, { notifyStaff: true, notifyAdmins: Boolean(row.admin_notifications_enabled) });
            const stamp = now.toISOString();
            await sb.from("daily_operations_tasks").update({
              staff_notified_at: stamp,
              admin_notified_at: row.admin_notifications_enabled ? stamp : task.admin_notified_at,
            }).eq("id", task.id).is("staff_notified_at", null);
            summary.staffNotifications += notified.staffCount;
            summary.adminNotifications += notified.adminCount;
          }
        }
      } catch (e: any) {
        summary.errors.push(`${companyId}/${definition.kind}: ${e?.message || String(e)}`);
      }
    }
  }

  const utcToday = now.toISOString().slice(0, 10);
  const { data: customTasks, error: customTaskError } = await sb
    .from("daily_operations_tasks")
    .select("*, company:companies(timezone)")
    .in("task_kind", ["custom_kitchen", "custom_cleaning", "custom_both", "custom_driver"])
    .eq("status", "scheduled")
    .is("notifications_processed_at", null)
    .gte("task_date", addDays(utcToday, -1))
    .lte("task_date", addDays(utcToday, 5))
    .order("task_date", { ascending: true });
  if (customTaskError) throw customTaskError;
  for (const task of (customTasks || []) as any[]) {
    const timezone = task.company?.timezone || DEFAULT_TENANT_TIMEZONE;
    const localToday = toZonedISO(now, timezone);
    const dayDifference = Math.round((new Date(`${task.task_date}T00:00:00.000Z`).getTime() - new Date(`${localToday}T00:00:00.000Z`).getTime()) / 86400000);
    if (dayDifference < 0 || dayDifference > 3) continue;
    const lead = Math.max(0, Math.min(72, Number(task.notify_before_hours || 0)));
    const dueAt = zonedTaskInstant(String(task.task_date), String(task.scheduled_time), timezone).getTime() - lead * 60 * 60 * 1000;
    if (now.getTime() < dueAt) continue;
    try {
      const notified = await notifyTask(sb, task, task.company_id, {
        notifyStaff: task.notify_staff !== false,
        notifyAdmins: task.notify_admins !== false,
      });
      const stamp = now.toISOString();
      const update: Record<string, string | null> = { notifications_processed_at: stamp };
      if (task.notify_staff !== false) update.staff_notified_at = stamp;
      if (task.notify_admins !== false) update.admin_notified_at = stamp;
      const { error: updateError } = await sb.from("daily_operations_tasks").update(update)
        .eq("id", task.id).is("notifications_processed_at", null);
      if (updateError) throw updateError;
      summary.staffNotifications += notified.staffCount;
      summary.adminNotifications += notified.adminCount;
    } catch (e: any) {
      summary.errors.push(`${task.company_id}/${task.id}: ${e?.message || String(e)}`);
    }
  }
  return summary;
}
