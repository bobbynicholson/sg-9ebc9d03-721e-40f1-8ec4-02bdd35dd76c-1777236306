// Manager "Working / Managing only" mode.
//
// By default a kitchen_manager / cleaning_manager is oversight-only and does
// NOT receive the crew task notifications staff get. When they opt in to
// "Working" they are treated like a staff member of their department (same
// task pings, counted in the crew) until they clock out or the day rolls.
//
// The single source of truth is profiles.manager_working +
// manager_working_since. A stale flag (older than STALE_HOURS) is treated as
// "not working" at read time, so a manager who forgets to flip it off (or
// whose clock-out never fired) can't keep pulling tasks the next day.
import { supabase } from "@/integrations/supabase/client";

export const MANAGER_ROLES = ["kitchen_manager", "cleaning_manager"] as const;
export type ManagerRole = (typeof MANAGER_ROLES)[number];

// A working flag older than this is treated as expired (the "resets each
// day" guarantee, independent of whether clock-out actually fired).
const STALE_HOURS = 18;

export function isManagerRole(role: string | null | undefined): role is ManagerRole {
  return !!role && (MANAGER_ROLES as readonly string[]).includes(role);
}

// The crew (staff) role a given manager stands in for.
export function crewRoleForManager(role: string | null | undefined): string | null {
  if (role === "kitchen_manager") return "kitchen_staff";
  if (role === "cleaning_manager") return "cleaning_staff";
  return null;
}

// Pure predicate: given a profile-ish row, is this manager working RIGHT NOW?
// Used both client-side (toggle state) and server-side (notification filter)
// so the staleness rule lives in exactly one place.
export function isManagerWorkingNow(
  row: { manager_working?: boolean | null; manager_working_since?: string | null } | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!row || row.manager_working !== true) return false;
  if (!row.manager_working_since) return false;
  const since = new Date(row.manager_working_since).getTime();
  if (!Number.isFinite(since)) return false;
  return now - since < STALE_HOURS * 60 * 60 * 1000;
}

export const managerWorkModeService = {
  // Current working state for a single user (with staleness applied).
  async getWorkMode(userId: string): Promise<{ working: boolean; since: string | null }> {
    const { data, error } = await supabase
      .from("profiles")
      .select("manager_working, manager_working_since")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("[managerWorkModeService.getWorkMode]", error);
      return { working: false, since: null };
    }
    return {
      working: isManagerWorkingNow(data as any),
      since: (data as any)?.manager_working_since ?? null,
    };
  },

  // Opt a manager in/out of working. Turning on stamps the current time;
  // turning off clears both fields.
  async setWorkMode(userId: string, on: boolean): Promise<boolean> {
    const patch = on
      ? { manager_working: true, manager_working_since: new Date().toISOString() }
      : { manager_working: false, manager_working_since: null };
    const { error } = await supabase.from("profiles").update(patch as any).eq("id", userId);
    if (error) {
      console.error("[managerWorkModeService.setWorkMode]", error);
      return false;
    }
    return true;
  },

  // Reset on clock-out (called best-effort, safe for any role).
  async resetWorkMode(userId: string): Promise<void> {
    const { error } = await supabase
      .from("profiles")
      .update({ manager_working: false, manager_working_since: null } as any)
      .eq("id", userId);
    if (error) console.error("[managerWorkModeService.resetWorkMode]", error);
  },
};
