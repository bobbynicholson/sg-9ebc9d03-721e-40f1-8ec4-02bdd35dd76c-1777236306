export type RosterDepartment = "kitchen" | "cleaning" | "driver";

export interface RosterStaffProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  active_role?: string | null;
}

export interface RosterDepartmentRow {
  user_id: string | null;
  department: string | null;
}

export interface RosterStaffLink {
  linked_profile_id?: string | null;
  email?: string | null;
}

const ROSTER_ROLE_ALIASES: Record<RosterDepartment, string[]> = {
  kitchen: ["kitchen", "kitchen_staff", "kitchen_manager"],
  cleaning: ["cleaning", "cleaning_staff", "cleaning_manager"],
  driver: ["driver", "driver_staff"],
};

function normalise(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

export function rosterDepartmentAliases(department: RosterDepartment): string[] {
  return ROSTER_ROLE_ALIASES[department];
}

export function filterRosterStaff<T extends RosterStaffProfile>(
  profiles: T[],
  departments: RosterDepartmentRow[],
  rosterDepartment: RosterDepartment,
): T[] {
  const allowed = new Set(ROSTER_ROLE_ALIASES[rosterDepartment]);
  const departmentsByUser = new Map<string, string[]>();

  for (const row of departments) {
    if (!row.user_id) continue;
    const department = normalise(row.department);
    if (!department) continue;
    const existing = departmentsByUser.get(row.user_id);
    if (existing) existing.push(department);
    else departmentsByUser.set(row.user_id, [department]);
  }

  return profiles.filter((profile) => {
    const profileRole = normalise(profile.role);
    // active_role is a portal preference, not an access grant. A valid
    // additional role comes from user_departments, even when a different
    // portal is currently selected.
    if (allowed.has(profileRole)) return true;

    const assignedDepartments = departmentsByUser.get(profile.id) || [];
    return assignedDepartments.some((department) => allowed.has(department));
  });
}

/**
 * Link a directory record to a roster profile only when that profile is
 * eligible for the department. Email fallback is allowed only when it
 * identifies one eligible profile, so a shared/stale email cannot turn a
 * tablet worker into a driver or another non-roster role.
 */
export function resolveRosterProfileId<T extends RosterStaffProfile>(
  link: RosterStaffLink,
  profiles: T[],
  eligibleProfileIds: ReadonlySet<string>,
): string | null {
  if (link.linked_profile_id) {
    return eligibleProfileIds.has(link.linked_profile_id)
      ? link.linked_profile_id
      : null;
  }

  const email = normalise(link.email);
  if (!email) return null;

  const matches = profiles.filter(
    (profile) => eligibleProfileIds.has(profile.id) && normalise(profile.email) === email,
  );
  return matches.length === 1 ? matches[0].id : null;
}

export function displayRosterRole(profile: RosterStaffProfile): string {
  const role = normalise(profile.active_role) || normalise(profile.role) || "staff";
  return role.replace(/_/g, " ");
}
