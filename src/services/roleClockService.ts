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

const ROLE_LABELS: Record<WorkRole, string> = {
  driver: "Driver",
  waiter: "Waiter",
  kitchen: "Kitchen",
  cleaning: "Cleaning",
};

function roleLabel(role: WorkRole): string {
  return ROLE_LABELS[role] || role;
}

function sourceClock(closed: ClosedRoleClock[]): ClosedRoleClock | null {
  return [...closed]
    .filter((item) => item.startedAt)
    .sort((a, b) => {
      const byStart = new Date(b.startedAt as string).getTime() - new Date(a.startedAt as string).getTime();
      if (byStart !== 0) return byStart;
      // The unified session is authoritative when timestamps are identical.
      return Number(b.source === "role_work_session") - Number(a.source === "role_work_session");
    })[0] || closed[0] || null;
}

let noteDialogQueue: Promise<unknown> = Promise.resolve();

function queueNoteDialog<T>(factory: () => Promise<T>): Promise<T> {
  const next = noteDialogQueue.then(factory, factory);
  noteDialogQueue = next.then(() => undefined, () => undefined);
  return next;
}

function showNoteDialog(args: {
  title: string;
  description: string;
  fallback: string;
  suggestions: string[];
}): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined" || !document.body) {
    return Promise.resolve(args.fallback);
  }

  return queueNoteDialog(() => new Promise<string>((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "role-clock-note-dialog";
    overlay.setAttribute("role", "presentation");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      background: "rgba(15, 23, 42, 0.55)",
    });

    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "role-clock-note-title");
    Object.assign(panel.style, {
      width: "min(100%, 480px)",
      maxHeight: "calc(100vh - 32px)",
      overflowY: "auto",
      borderRadius: "14px",
      background: "#ffffff",
      color: "#0f172a",
      padding: "24px",
      border: "1px solid rgb(var(--brand-primary-rgb, 37 99 235) / 0.2)",
      boxShadow: "0 24px 70px rgba(15, 23, 42, 0.35)",
      fontFamily: "system-ui, sans-serif",
    });

    const title = document.createElement("h2");
    title.id = "role-clock-note-title";
    title.textContent = args.title;
    Object.assign(title.style, { margin: "0 0 8px", fontSize: "20px", fontWeight: "700", color: "var(--brand-primary, #2563eb)" });

    const description = document.createElement("p");
    description.textContent = args.description;
    Object.assign(description.style, { margin: "0 0 16px", color: "#475569", lineHeight: "1.5", fontSize: "14px" });

    const textarea = document.createElement("textarea");
    textarea.rows = 4;
    textarea.placeholder = "Describe what you completed before switching.";
    textarea.setAttribute("aria-label", "Work completed");
    Object.assign(textarea.style, {
      display: "block",
      boxSizing: "border-box",
      width: "100%",
      resize: "vertical",
      border: "1px solid #cbd5e1",
      borderRadius: "8px",
      padding: "10px 12px",
      font: "inherit",
      fontSize: "14px",
      outline: "none",
    });

    const suggestions = document.createElement("div");
    Object.assign(suggestions.style, { display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" });
    for (const suggestion of args.suggestions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = suggestion;
      Object.assign(button.style, {
        border: "1px solid #cbd5e1",
        borderRadius: "999px",
        background: "#ffffff",
        color: "#334155",
        padding: "6px 10px",
        fontSize: "12px",
        cursor: "pointer",
      });
      button.addEventListener("click", () => { textarea.value = suggestion; textarea.focus(); });
      suggestions.appendChild(button);
    }

    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" });

    const finish = (value?: string) => {
      cleanup();
      resolve(value?.trim() || args.fallback);
    };
    const defaultButton = document.createElement("button");
    defaultButton.type = "button";
    defaultButton.textContent = "Use default note";
    Object.assign(defaultButton.style, { border: "1px solid #cbd5e1", borderRadius: "8px", background: "#ffffff", padding: "9px 12px", cursor: "pointer" });
    defaultButton.addEventListener("click", () => finish());

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save note";
    Object.assign(saveButton.style, { border: "0", borderRadius: "8px", background: "rgb(var(--brand-primary-rgb, 37 99 235))", color: "#ffffff", padding: "9px 14px", cursor: "pointer", fontWeight: "600" });
    saveButton.addEventListener("click", () => finish(textarea.value));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") finish(textarea.value);
    };
    const cleanup = () => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
    };
    document.addEventListener("keydown", onKeyDown);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) finish(); });

    footer.append(defaultButton, saveButton);
    panel.append(title, description, textarea, suggestions, footer);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    window.setTimeout(() => textarea.focus(), 0);
  }));
}

export async function promptForAutomaticRoleClockNote(
  role: WorkRole,
  reason: string,
): Promise<string> {
  const fallback = `${reason} Your ${role} timer was closed automatically; no additional note supplied.`;
  return showNoteDialog({
    title: "Timer closed automatically",
    description: `${reason} What work did you complete as ${role} before the timer closed?`,
    fallback,
    suggestions: [
      "Completed the assigned work.",
      "Finished the current task and handed it over.",
      "No additional work to report.",
      "Started the clock by mistake; no work completed.",
    ],
  });
}

export async function promptForRoleHandoffNote(
  closed: ClosedRoleClock[],
  nextRole?: WorkRole,
): Promise<string> {
  const source = sourceClock(closed);
  // Several old role tables can contain an open row after a legacy session.
  // They are all closed for consistency, but only the newest active source
  // represents where the person was actually working immediately before
  // this switch (e.g. Waiter -> Driver, not stale Kitchen -> Driver).
  const previous = source ? roleLabel(source.role) : "your previous role";
  const sameRoleOrderHandoff = !!nextRole && source?.role === nextRole;
  const next = nextRole ? roleLabel(nextRole) : null;
  const fallback = sameRoleOrderHandoff
    ? `Switched to another order; previous ${previous} work was automatically closed. No additional note supplied.`
    : next
      ? `Switched from ${previous} to ${next}; previous work was automatically closed. No additional note supplied.`
    : DEFAULT_ROLE_SWITCH_NOTE;
  if (!closed.length) return fallback;
  const transitionTitle = next && previous
    ? `${previous} → ${next} handoff`
    : "Role timer handoff";
  const description = sameRoleOrderHandoff
    ? `You are changing orders while staying as ${previous}. What did you complete on the previous order?`
    : next
      ? `You are switching from ${previous} to ${next}. What did you complete as ${previous} before starting ${next}?`
      : `What did you complete as ${previous} before your timer was closed?`;
  return showNoteDialog({
    title: sameRoleOrderHandoff ? "Switching to another order" : transitionTitle,
    description,
    fallback,
    suggestions: [
      "Completed the assigned work.",
      "Finished the current task and handed it over.",
      "No additional work to report.",
      "Started the clock by mistake; no work completed.",
    ],
  });
}

export async function promptForWorkNote(promptText: string, fallback: string): Promise<string> {
  return showNoteDialog({
    title: "Add a work note",
    description: promptText,
    fallback,
    suggestions: [
      "Completed the assigned work.",
      "Finished the current task and handed it over.",
      "No additional work to report.",
      "Started the clock by mistake; no work completed.",
    ],
  });
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
  throw new Error("The shared work timer could not be started. No department timer was created.");
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
