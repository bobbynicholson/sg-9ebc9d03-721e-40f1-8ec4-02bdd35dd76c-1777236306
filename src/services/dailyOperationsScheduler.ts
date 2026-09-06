/* eslint-disable @typescript-eslint/no-explicit-any */
import { getServiceSupabase } from "@/lib/supabase/service";
import { toZonedISO, DEFAULT_TENANT_TIMEZONE } from "@/lib/localDate";

const TASK_LINK = "/team-portal/cleaning/tasks";
const ADMIN_LINK = "/admin/daily-operations";
type Target = "kitchen" | "cleaning" | "both";

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

async function notifyUsers(sb: any, userIds: string[], payload: Record<string, any>) {
  if (!userIds.length) return 0;
  const rows = userIds.map((id) => ({
    company_id: payload.company_id,
    user_id: id,
    recipient_id: id,
    notification_type: "daily_operations_task",
    type: "daily_operations_task",
    title: payload.title,
    message: payload.message,
    priority: payload.priority || "normal",
    target_role: payload.target_role || null,
    link: payload.link || TASK_LINK,
    action_url: payload.link || TASK_LINK,
    related_entity_type: "daily_operations_task",
    related_entity_id: payload.task_id,
    is_read: false,
  }));
  const { error } = await sb.from("notifications").insert(rows);
  if (error) throw error;
  return rows.length;
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
    title: `Daily task: ${task.title}`,
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
      title: `Daily operations scheduled: ${task.title}`,
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
      { kind: "kitchen_cleaning", enabled: row.kitchen_cleaning_enabled, time: row.kitchen_cleaning_time, title: row.kitchen_cleaning_title, description: row.kitchen_cleaning_description, lead: Number(row.kitchen_cleaning_lead_hours || 0), target: row.kitchen_cleaning_target as Target },
      { kind: "equipment_cleaning", enabled: row.equipment_cleaning_enabled, time: row.equipment_cleaning_time, title: row.equipment_cleaning_title, description: row.equipment_cleaning_description, lead: Number(row.equipment_cleaning_lead_hours || 0), target: row.equipment_cleaning_target as Target },
    ];

    for (const definition of definitions) {
      if (!definition.enabled) continue;
      try {
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
        const { data: task, error: readError } = await sb
          .from("daily_operations_tasks")
          .select("*")
          .eq("company_id", companyId)
          .eq("task_kind", definition.kind)
          .eq("task_date", taskDate)
          .maybeSingle();
        if (readError) throw readError;
        if (!task) continue;
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
