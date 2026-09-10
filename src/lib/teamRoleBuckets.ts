import { UserRole } from "@/types/app";
import { normalizeRoleValue, uniqueRoles } from "@/lib/roleDerivation";

export type TeamRoleBucket =
  | "kitchen"
  | "cleaning"
  | "drivers"
  | "shopping"
  | "sales"
  | "admin"
  | "client"
  | "outsource"
  | "other";

export interface TeamRoleProfile {
  id: string;
  role?: string | null;
  active_role?: string | null;
  primary_department?: string | null;
  departments?: Array<string | null | undefined> | null;
}

export interface TeamRoleDepartmentRow {
  user_id?: string | null;
  department?: string | null;
  is_primary?: boolean | null;
}

export const TEAM_BUCKET_ROLES: Record<Exclude<TeamRoleBucket, "other">, UserRole[]> = {
  kitchen: [UserRole.KITCHEN_MANAGER, UserRole.KITCHEN_STAFF],
  cleaning: [UserRole.CLEANING_MANAGER, UserRole.CLEANING_STAFF],
  drivers: [UserRole.DRIVER],
  shopping: [UserRole.SHOPPING_STAFF],
  sales: [UserRole.SALES_ADMIN],
  admin: [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.REGION_ADMIN],
  client: [UserRole.CLIENT],
  outsource: [],
};

const ROLE_TO_BUCKET = new Map<UserRole, TeamRoleBucket>(
  Object.entries(TEAM_BUCKET_ROLES).flatMap(([bucket, roles]) =>
    roles.map((role) => [role, bucket as TeamRoleBucket] as const),
  ),
);

export function teamBucketForRole(role: UserRole | string | null | undefined): TeamRoleBucket {
  const normalized = normalizeRoleValue(role);
  if (!normalized) {
    return String(role || "").trim().toLowerCase() === "outsource" ? "outsource" : "other";
  }
  return ROLE_TO_BUCKET.get(normalized) || "other";
}

export function departmentRowsForUser(
  departments: TeamRoleDepartmentRow[] | null | undefined,
  userId: string,
): TeamRoleDepartmentRow[] {
  return (departments || []).filter((row) => row.user_id === userId);
}

export function accessRolesForUser(
  profile: TeamRoleProfile,
  departmentRows?: TeamRoleDepartmentRow[] | null,
): UserRole[] {
  const profileRole = normalizeRoleValue(profile.role);
  const activeRole = normalizeRoleValue(profile.active_role, profileRole);
  const fallback = activeRole || profileRole;
  const inlineDepartments = (profile.departments || []).map((department) => ({
    department,
    is_primary: department === profile.primary_department,
  }));
  const rows = [...inlineDepartments, ...(departmentRowsForUser(departmentRows, profile.id) || [])]
    .sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary));
  const departmentRoles = rows
    .map((row) => normalizeRoleValue(row.department, fallback))
    .filter((role): role is UserRole => Boolean(role));
  const primaryDepartment = normalizeRoleValue(profile.primary_department, fallback);

  return uniqueRoles([profileRole, activeRole, primaryDepartment, ...departmentRoles]);
}

export function teamBucketsForUser(
  profile: TeamRoleProfile,
  departmentRows?: TeamRoleDepartmentRow[] | null,
): Set<TeamRoleBucket> {
  const buckets = new Set<TeamRoleBucket>();
  for (const role of accessRolesForUser(profile, departmentRows)) {
    buckets.add(teamBucketForRole(role));
  }
  const rawValues = [
    profile.role,
    profile.active_role,
    profile.primary_department,
    ...(profile.departments || []),
    ...departmentRowsForUser(departmentRows, profile.id).map((row) => row.department),
  ];
  if (rawValues.some((value) => String(value || "").trim().toLowerCase() === "outsource")) {
    buckets.add("outsource");
  }
  if (buckets.size === 0) buckets.add("other");
  return buckets;
}

export function countTeamBuckets<T extends TeamRoleProfile>(
  profiles: T[],
  departmentRows?: TeamRoleDepartmentRow[] | null,
): Record<TeamRoleBucket, number> {
  const counts: Record<TeamRoleBucket, number> = {
    kitchen: 0,
    cleaning: 0,
    drivers: 0,
    shopping: 0,
    sales: 0,
    admin: 0,
    client: 0,
    outsource: 0,
    other: 0,
  };

  for (const profile of profiles) {
    const buckets = teamBucketsForUser(profile, departmentRows);
    for (const bucket of buckets) {
      counts[bucket] += 1;
    }
  }

  return counts;
}
