/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from "@/integrations/supabase/client";
import { timeClockService } from "@/services/timeClockService";
import { endRoleClock, type WorkRole } from "@/services/roleClockService";

const taskClockReason = (taskId: string) => `daily_operations_task:${taskId}`;

export async function finishDailyOperationTaskRoleClock(args: {
  companyId: string;
  userId: string;
  taskId: string;
  role: WorkRole;
  note?: string;
}, client: any = supabase): Promise<void> {
  const { data: session, error } = await client.from("role_work_sessions")
    .select("id")
    .eq("company_id", args.companyId)
    .eq("user_id", args.userId)
    .eq("role", args.role)
    .eq("daily_operation_task_id", args.taskId)
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!session?.id) return;
  await endRoleClock({
    sessionId: String(session.id),
    userId: args.userId,
    role: args.role,
    reason: "daily_task_complete",
    note: args.note || "Daily task completed.",
    client,
  });
}

/**
 * Start an unpaid payroll session for task work only when no normal staff,
 * department, or driver shift is already covering the person's time. This
 * keeps task work visible in the existing staff-hours payment flow without
 * paying the same minutes twice during an already-clocked shift.
 */
export async function startDailyOperationTaskPayrollClock(args: {
  companyId: string;
  userId: string;
  taskId: string;
  taskTitle: string;
}, client: any = supabase): Promise<string | null> {
  const { data: task, error: taskError } = await client
    .from("daily_operations_tasks")
    .select("payroll_session_id")
    .eq("id", args.taskId)
    .eq("company_id", args.companyId)
    .maybeSingle();
  if (taskError) throw taskError;
  if (task?.payroll_session_id) {
    const { data: linkedSession, error: linkedError } = await client.from("staff_work_sessions")
      .select("id, clock_out, entry_reason")
      .eq("id", task.payroll_session_id)
      .eq("company_id", args.companyId)
      .eq("staff_id", args.userId)
      .maybeSingle();
    if (linkedError) throw linkedError;
    if (linkedSession && !linkedSession.clock_out && linkedSession.entry_reason === taskClockReason(args.taskId)) {
      return String(linkedSession.id);
    }
  }

  const { data: openSession, error: openSessionError } = await client
    .from("staff_work_sessions")
    .select("id, entry_reason")
    .eq("company_id", args.companyId)
    .eq("staff_id", args.userId)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openSessionError) throw openSessionError;
  if (openSession) {
    if (openSession.entry_reason === taskClockReason(args.taskId)) {
      await linkTaskPayrollSession(client, args, String(openSession.id));
      return String(openSession.id);
    }
    return null;
  }

  const activeChecks = await Promise.all([
    // role_work_sessions is an activity/role switch clock. It is not itself
    // a payroll record, so it must not suppress the Staff hours session.
    client.from("driver_shifts").select("id").eq("company_id", args.companyId).eq("driver_id", args.userId).not("actual_start", "is", null).is("actual_end", null).is("deleted_at", null).limit(1),
    client.from("kitchen_duty_shifts").select("id").eq("company_id", args.companyId).or(`staff_id.eq.${args.userId},user_id.eq.${args.userId}`).eq("is_active", true).limit(1),
    client.from("cleaning_duty_logs").select("id").eq("company_id", args.companyId).eq("user_id", args.userId).eq("on_duty", true).is("duty_ended_at", null).limit(1),
    client.from("kitchen_staff_members").select("id").eq("company_id", args.companyId).eq("linked_profile_id", args.userId).is("deleted_at", null),
  ]);
  const [driverShift, kitchenDuty, cleaningDuty, kitchenLinks] = activeChecks;
  const checkError = activeChecks.find((result) => result.error)?.error;
  if (checkError) throw checkError;

  const kitchenMemberIds = (kitchenLinks.data || []).map((row: any) => row.id).filter(Boolean);
  let kitchenTabletShift: any = { data: [], error: null };
  if (kitchenMemberIds.length) {
    kitchenTabletShift = await client.from("kitchen_staff_shifts")
      .select("id")
      .eq("company_id", args.companyId)
      .in("staff_member_id", kitchenMemberIds)
      .is("shift_end", null)
      .is("deleted_at", null)
      .limit(1);
  }
  if (kitchenTabletShift.error) throw kitchenTabletShift.error;
  if (driverShift.data?.length || kitchenDuty.data?.length || cleaningDuty.data?.length || kitchenTabletShift.data?.length) {
    return null;
  }

  const created = await timeClockService.clockIn(args.userId, `Daily task: ${args.taskTitle}`, undefined, taskClockReason(args.taskId));
  const sessionId = String((created.session as any)?.id || "");
  if (!sessionId) throw new Error("The task timer started, but no payable work session was returned.");

  await linkTaskPayrollSession(client, args, sessionId);
  return sessionId;
}

async function linkTaskPayrollSession(
  client: any,
  args: { companyId: string; userId: string; taskId: string },
  sessionId: string,
) {
  const { error } = await client.rpc("link_daily_operation_task_payroll_session", {
    p_task_id: args.taskId,
    p_session_id: sessionId,
  });
  if (error) throw error;
}

/** Close only the session opened for this task; an unrelated shift clock is never stopped. */
export async function finishDailyOperationTaskPayrollClock(args: {
  companyId: string;
  userId: string;
  taskId: string;
  taskTitle: string;
}, client: any = supabase): Promise<void> {
  const { data: task, error: taskError } = await client
    .from("daily_operations_tasks")
    .select("payroll_session_id")
    .eq("id", args.taskId)
    .eq("company_id", args.companyId)
    .maybeSingle();
  if (taskError) throw taskError;
  if (!task?.payroll_session_id) return;

  const sessionId = String(task.payroll_session_id);
  const { data: session, error: sessionError } = await client.from("staff_work_sessions")
    .select("id, clock_out, entry_reason")
    .eq("id", sessionId)
    .eq("company_id", args.companyId)
    .eq("staff_id", args.userId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session || session.clock_out || session.entry_reason !== taskClockReason(args.taskId)) return;

  const { data: latestOpen, error: latestError } = await client.from("staff_work_sessions")
    .select("id")
    .eq("company_id", args.companyId)
    .eq("staff_id", args.userId)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  if (latestOpen?.id !== sessionId) return;

  await timeClockService.clockOut(args.userId, `Completed daily task: ${args.taskTitle}`, undefined, sessionId);
}
