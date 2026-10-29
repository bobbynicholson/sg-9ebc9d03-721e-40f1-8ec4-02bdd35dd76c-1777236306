import { UserRole } from "@/types/app";

export interface RoleDepartmentInput {
  department?: string | null;
  is_primary?: boolean | null;
}

const ROLE_VALUES = new Set<string>(Object.values(UserRole));

/** A portal preference can never confer platform authority. */
export function effectiveProfileRole(profile: { role?: string | null; active_role?: string | null }): string {
  if (profile.role === UserRole.SUPER_ADMIN) return UserRole.SUPER_ADMIN;
  return profile.active_role === UserRole.SUPER_ADMIN
    ? String(profile.role || "") : String(profile.active_role || profile.role || "");
}

export function canAssignTenantPrivileges(baseRole: string, requestedRoles: string[], targetRole?: string): boolean {
  if (baseRole === UserRole.SUPER_ADMIN) return true;
  if (targetRole === UserRole.SUPER_ADMIN || requestedRoles.includes(UserRole.SUPER_ADMIN)) return false;
  if ([UserRole.OWNER, UserRole.COMPANY_ADMIN].includes(baseRole as UserRole)) return true;
  return ![...requestedRoles, targetRole].some(role => role === UserRole.OWNER || role === UserRole.COMPANY_ADMIN);
}

export function normalizeRoleValue(
  value: string | null | undefined,
  fallbackRole?: UserRole | string | null,
): UserRole | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (ROLE_VALUES.has(raw)) {
    return raw as UserRole;
  }

  switch (raw) {
    case "kitchen":
      return fallbackRole === UserRole.KITCHEN_MANAGER ? UserRole.KITCHEN_MANAGER : UserRole.KITCHEN_STAFF;
    case "cleaning":
      return fallbackRole === UserRole.CLEANING_MANAGER ? UserRole.CLEANING_MANAGER : UserRole.CLEANING_STAFF;
    case "shopping":
    case "buyer":
      return UserRole.SHOPPING_STAFF;
    case "waitering":
    case "server":
      return UserRole.WAITER;
    default:
      return null;
  }
}

export function uniqueRoles(values: Array<UserRole | null | undefined>): UserRole[] {
  const seen = new Set<UserRole>();
  const roles: UserRole[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    roles.push(value);
  }

  return roles;
}

export function deriveUserRoles(args: {
  profileRole?: string | null;
  activeRole?: string | null;
  departments?: RoleDepartmentInput[] | null;
}): { roles: UserRole[]; activeRole: UserRole } {
  const profileRole = normalizeRoleValue(args.profileRole);
  const activeCandidate = normalizeRoleValue(args.activeRole, profileRole);
  const departments = [...(args.departments || [])].sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary));
  const departmentRoles = departments
    .map((department) => normalizeRoleValue(department.department, profileRole))
    .filter((role) => role !== UserRole.SUPER_ADMIN || profileRole === UserRole.SUPER_ADMIN)
    .filter((role): role is UserRole => !!role);

  const baseRoles = uniqueRoles([profileRole, ...departmentRoles]);
  // A portal preference is not an access grant. Only the stored base role
  // and administrator-managed assignments establish permissions.
  const roles = baseRoles;

  return {
    roles: roles.length > 0 ? roles : [UserRole.CLIENT],
    activeRole:
      activeCandidate && roles.includes(activeCandidate)
        ? activeCandidate
        : departmentRoles[0] || profileRole || roles[0] || UserRole.CLIENT,
  };
}
