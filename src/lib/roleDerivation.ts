import { UserRole } from "@/types/app";

export interface RoleDepartmentInput {
  department?: string | null;
  is_primary?: boolean | null;
}

const ROLE_VALUES = new Set<string>(Object.values(UserRole));

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
    .map((department) => normalizeRoleValue(department.department, activeCandidate || profileRole))
    .filter((role): role is UserRole => !!role);

  const baseRoles = uniqueRoles([profileRole, ...departmentRoles]);
  const roles = baseRoles.length > 0
    ? uniqueRoles([...baseRoles, activeCandidate])
    : uniqueRoles([activeCandidate]);

  return {
    roles: roles.length > 0 ? roles : [UserRole.CLIENT],
    activeRole:
      activeCandidate
        ? activeCandidate
        : departmentRoles[0] || profileRole || roles[0] || UserRole.CLIENT,
  };
}
