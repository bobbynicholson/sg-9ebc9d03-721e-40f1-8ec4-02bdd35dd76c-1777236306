import { supabase as defaultClient } from "@/integrations/supabase/client";

export type WorkRole = "driver" | "waiter" | "kitchen" | "cleaning";

export type ClosedRoleClock = {
  source: "role_work_session" | "driver_shift" | "waiter_attendance" | "kitchen_duty" | "cleaning_duty";
  id: string;
  role: WorkRole;
  orderId: string | null;
  startedAt: string | null;
};

export const DEFAULT_ROLE_SWITCH_NOTE =
  "Role switch: previous work was automatically closed. No additional note supplied.";

export function promptForAutomaticRoleClockNote(
  role: WorkRole,
  reason: string,
): string {
  const fallback = `${reason} Your ${role} timer was closed automatically; no additional note supplied.`;
  if (typeof window === "undefined") return fallback;
  const answer = window.prompt(
    `${reason} What work did you complete as ${role} before the timer closed?`,
    "",
  );
  return answer?.trim() || fallback;
}

export function promptForRoleHandoffNote(
  closed: ClosedRoleClock[],
  nextRole?: WorkRole,
): string {
  const sameRoleOrderHandoff = !!nextRole && closed.every((item) => item.role === nextRole);
  const fallback = sameRoleOrderHandoff
    ? `Switched to another order; previous ${nextRole} work was automatically closed. No additional note supplied.`
    : nextRole
      ? `Switched to ${nextRole}; previous work was automatically closed. No additional note supplied.`
    : DEFAULT_ROLE_SWITCH_NOTE;
  if (!closed.length || typeof window === "undefined") return fallback;
  const previous = Array.from(new Set(closed.map((item) => item.role))).join(", ");
  const answer = window.prompt(
    `What did you complete as ${previous} before ${sameRoleOrderHandoff ? "switching to another order" : `switching${nextRole ? ` to ${nextRole}` : " roles"}`}?`,
    "",
  );
  return answer?.trim() || fallback;
}

export function promptForWorkNote(promptText: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return window.prompt(promptText, "")?.trim() || fallback;
}

type Client = typeof defaultClient;

function isDuplicate(error: any): boolean {
  return error?.code === "23505" || /duplicate key/i.test(String(error?.message || ""));
}

/**
 * Close legacy role clocks before a user starts another role. The updates are
 * deliberately scoped to the user/company and are idempotent, so a realtime
 * retry cannot extend or duplicate the closed segment.
 */
async function closeLegacyOtherRoleClocks(
  client: Client,
  args: { companyId: string; userId: string; nextRole: WorkRole; at: string; note: string },
): Promise<ClosedRoleClock[]> {
  const closed: ClosedRoleClock[] = [];
  const { companyId, userId, nextRole, at, note } = args;

  if (nextRole !== "driver") {
    const { data } = await (client as any).from("driver_shifts")
      .select("id, order_id, actual_start")
      .eq("company_id", companyId).eq("driver_id", userId)
      .is("actual_end", null).is("deleted_at", null);
    for (const row of data || []) {
      const { error } = await (client as any).from("driver_shifts")
        .update({ actual_end: at, status: "completed", notes: note })
        .eq("id", row.id).is("actual_end", null);
      if (!error) closed.push({ source: "driver_shift", id: row.id, role: "driver", orderId: row.order_id || null, startedAt: row.actual_start || null });
    }
  }

  if (nextRole !== "waiter") {
    const { data } = await (client as any).from("event_attendance")
      .select("id, order_id, work_started_at")
      .eq("company_id", companyId).eq("waiter_id", userId)
      .not("work_started_at", "is", null).is("work_ended_at", null);
    for (const row of data || []) {
      const { error } = await (client as any).from("event_attendance")
        .update({ work_ended_at: at, work_end_reason: "role_switch", work_end_note: note })
        .eq("id", row.id).is("work_ended_at", null);
      if (!error) closed.push({ source: "waiter_attendance", id: row.id, role: "waiter", orderId: row.order_id || null, startedAt: row.work_started_at || null });
    }
  }

  if (nextRole !== "kitchen") {
    const { data } = await (client as any).from("kitchen_duty_shifts")
      .select("id, order_id, shift_start")
      .eq("company_id", companyId).eq("staff_id", userId).eq("is_active", true);
    for (const row of data || []) {
      const { error } = await (client as any).from("kitchen_duty_shifts")
        .update({ is_active: false, shift_end: at, end_reason: "role_switch", end_note: note })
        .eq("id", row.id).eq("is_active", true);
      if (!error) closed.push({ source: "kitchen_duty", id: row.id, role: "kitchen", orderId: row.order_id || null, startedAt: row.shift_start || null });
    }
  }

  if (nextRole !== "cleaning") {
    const { data } = await (client as any).from("cleaning_duty_logs")
      .select("id, duty_started_at")
      .eq("company_id", companyId).eq("user_id", userId).eq("on_duty", true).is("duty_ended_at", null);
    for (const row of data || []) {
      const { error } = await (client as any).from("cleaning_duty_logs")
        .update({ on_duty: false, duty_ended_at: at, duty_end_reason: "role_switch", duty_end_note: note })
        .eq("id", row.id).eq("on_duty", true);
      if (!error) closed.push({ source: "cleaning_duty", id: row.id, role: "cleaning", orderId: null, startedAt: row.duty_started_at || null });
    }
  }
  return closed;
}

/** Start/continue a role clock and close any other role for this person. */
export async function beginRoleClock(args: {
  companyId: string;
  userId: string;
  role: WorkRole;
  orderId?: string | null;
  startedAt?: string;
  client?: Client;
}): Promise<{ sessionId: string | null; closed: ClosedRoleClock[] }> {
  const client = args.client || defaultClient;
  const at = args.startedAt || new Date().toISOString();
  const requestedOrderId = args.orderId || null;
  const { data: current } = await (client as any).from("role_work_sessions")
    .select("id, role, order_id, started_at")
    .eq("company_id", args.companyId).eq("user_id", args.userId)
    .is("ended_at", null).maybeSingle();
  const closed: ClosedRoleClock[] = [];

  const orderContextChanged = !!current && current.role === args.role && (current.order_id || null) !== requestedOrderId;
  const roleChanged = !!current && current.role !== args.role;
  const closeReason = orderContextChanged ? "order_switch" : "role_switch";
  const defaultNote = orderContextChanged
    ? `Switched to another order; previous ${current?.role || args.role} work was automatically closed. No additional note supplied.`
    : `Role switch to ${args.role}; previous role was automatically closed. No additional note supplied.`;

  if (current && (roleChanged || orderContextChanged)) {
    const { error } = await (client as any).from("role_work_sessions")
      .update({ ended_at: at, end_reason: closeReason, end_note: defaultNote })
      .eq("id", current.id).is("ended_at", null);
    if (!error) closed.push({ source: "role_work_session", id: current.id, role: current.role, orderId: current.order_id || null, startedAt: current.started_at || null });
  }

  const legacyClosed = await closeLegacyOtherRoleClocks(client, {
    companyId: args.companyId, userId: args.userId, nextRole: args.role, at, note: defaultNote,
  });
  closed.push(...legacyClosed);

  if (current && current.role === args.role && !orderContextChanged) return { sessionId: current.id, closed };

  const { data: created, error } = await (client as any).from("role_work_sessions")
    .insert({ company_id: args.companyId, user_id: args.userId, role: args.role, order_id: requestedOrderId, started_at: at })
    .select("id")
    .maybeSingle();
  if (!error && created?.id) return { sessionId: created.id, closed };
  if (isDuplicate(error)) {
    const { data: raced } = await (client as any).from("role_work_sessions")
      .select("id, role, order_id, started_at")
      .eq("company_id", args.companyId).eq("user_id", args.userId).is("ended_at", null).maybeSingle();
    if (raced?.role === args.role) return { sessionId: raced.id, closed };
  }
  if (error) throw error;
  return { sessionId: null, closed };
}

/** Close a role session explicitly; no-op if another request already closed it. */
export async function endRoleClock(args: {
  sessionId?: string | null;
  userId: string;
  role: WorkRole;
  endedAt?: string;
  note?: string;
  reason?: string;
  client?: Client;
}) {
  if (!args.sessionId) return;
  const client = args.client || defaultClient;
  await (client as any).from("role_work_sessions")
    .update({ ended_at: args.endedAt || new Date().toISOString(), end_reason: args.reason || "manual", end_note: args.note || "No note supplied." })
    .eq("id", args.sessionId).eq("user_id", args.userId).eq("role", args.role).is("ended_at", null);
}

export async function endCurrentRoleClock(args: {
  companyId: string;
  userId: string;
  role: WorkRole;
  endedAt?: string;
  note?: string;
  reason?: string;
  client?: Client;
}) {
  const client = args.client || defaultClient;
  const { data: current } = await (client as any).from("role_work_sessions")
    .select("id, role, order_id, started_at")
    .eq("company_id", args.companyId).eq("user_id", args.userId).eq("role", args.role)
    .is("ended_at", null).maybeSingle();
  if (!current?.id) return null;
  await endRoleClock({ ...args, sessionId: current.id, client });
  return {
    source: "role_work_session",
    id: current.id,
    role: current.role,
    orderId: current.order_id || null,
    startedAt: current.started_at || null,
  } as ClosedRoleClock;
}

/** Persist the note after the close prompt without changing the timestamps. */
export async function saveRoleHandoffNote(closed: ClosedRoleClock[], note: string, client: Client = defaultClient) {
  const text = note.trim() || DEFAULT_ROLE_SWITCH_NOTE;
  for (const item of closed) {
    if (item.source === "role_work_session") {
      await (client as any).from("role_work_sessions").update({ end_note: text }).eq("id", item.id);
    } else if (item.source === "driver_shift") {
      await (client as any).from("driver_shifts").update({ notes: text }).eq("id", item.id);
    } else if (item.source === "waiter_attendance") {
      await (client as any).from("event_attendance").update({ work_end_note: text }).eq("id", item.id);
    } else if (item.source === "kitchen_duty") {
      await (client as any).from("kitchen_duty_shifts").update({ end_note: text }).eq("id", item.id);
    } else if (item.source === "cleaning_duty") {
      await (client as any).from("cleaning_duty_logs").update({ duty_end_note: text }).eq("id", item.id);
    }
  }
}
