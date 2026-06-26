export type RosterDepartment = "kitchen" | "cleaning";

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

const ROSTER_ROLE_ALIASES: Record<RosterDepartment, string[]> = {
  kitchen: ["kitchen", "kitchen_staff", "kitchen_manager"],
  cleaning: ["cleaning", "cleaning_staff", "cleaning_manager"],
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
    const activeRole = normalise(profile.active_role);
    if (allowed.has(profileRole) || allowed.has(activeRole)) return true;

    const assignedDepartments = departmentsByUser.get(profile.id) || [];
    return assignedDepartments.some((department) => allowed.has(department));
  });
}

export function displayRosterRole(profile: RosterStaffProfile): string {
  const role = normalise(profile.active_role) || normalise(profile.role) || "staff";
  return role.replace(/_/g, " ");
}
