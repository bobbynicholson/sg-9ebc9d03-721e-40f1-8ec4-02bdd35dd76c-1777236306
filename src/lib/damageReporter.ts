export interface DamageReporterUser {
  email?: string | null;
  full_name?: string | null;
  user_metadata?: {
    full_name?: string | null;
    [key: string]: unknown;
  } | null;
}

export interface DamageReporterProfile {
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
  active_role?: string | null;
}

export interface DamageReporterSource {
  reported_by?: string | null;
  responsible_name?: string | null;
  reporter?: DamageReporterProfile | null;
}

function clean(value: string | null | undefined): string {
  return (value || "").trim();
}

export function reporterNameFromUser(user: DamageReporterUser | null | undefined): string {
  return (
    clean(user?.full_name) ||
    clean(user?.user_metadata?.full_name) ||
    clean(user?.email) ||
    "Team member"
  );
}

export function damageReporterName(damage: DamageReporterSource): string {
  return (
    clean(damage.responsible_name) ||
    clean(damage.reporter?.full_name) ||
    clean(damage.reporter?.email) ||
    (damage.reported_by ? "Staff member" : "Not recorded")
  );
}

export function damageReporterRole(damage: DamageReporterSource): string | null {
  const role = clean(damage.reporter?.active_role) || clean(damage.reporter?.role);
  return role ? role.replace(/_/g, " ") : null;
}
