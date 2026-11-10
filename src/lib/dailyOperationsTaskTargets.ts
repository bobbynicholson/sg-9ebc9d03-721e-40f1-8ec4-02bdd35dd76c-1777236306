import type { DailyOperationsTaskKind } from "@/services/dailyOperationsService";

export type OneOffTaskKind = Extract<DailyOperationsTaskKind, "custom_kitchen" | "custom_cleaning" | "custom_both" | "custom_driver">;

const KITCHEN_ROLES = ["kitchen_staff", "kitchen_manager"];
const CLEANING_ROLES = ["cleaning_staff", "cleaning_manager"];
const DRIVER_ROLES = ["driver"];

export function rolesForOneOffTask(kind: OneOffTaskKind): string[] {
  if (kind === "custom_kitchen") return [...KITCHEN_ROLES];
  if (kind === "custom_cleaning") return [...CLEANING_ROLES];
  if (kind === "custom_driver") return [...DRIVER_ROLES];
  return [...KITCHEN_ROLES, ...CLEANING_ROLES];
}

/** Dashboard visibility can be broader than the team responsible for
 * completing and receiving reminders for a task. */
export function dashboardRolesForOneOffTask(kind: OneOffTaskKind): string[] {
  if (kind === "custom_kitchen") return [...KITCHEN_ROLES];
  if (kind === "custom_cleaning" || kind === "custom_both") return [...KITCHEN_ROLES, ...CLEANING_ROLES];
  if (kind === "custom_driver") return [...DRIVER_ROLES];
  return [];
}

export function shiftTypesForOneOffTask(kind: OneOffTaskKind): string[] {
  if (kind === "custom_kitchen") return ["kitchen", "kitchen_and_cleaning"];
  if (kind === "custom_cleaning") return ["cleaning", "kitchen_and_cleaning"];
  if (kind === "custom_driver") return ["delivery"];
  return ["kitchen", "cleaning", "kitchen_and_cleaning"];
}

export function dashboardLabelForRoles(targetRoles: string[]): string {
  const hasKitchen = targetRoles.some((role) => KITCHEN_ROLES.includes(role));
  const hasCleaning = targetRoles.some((role) => CLEANING_ROLES.includes(role));
  const hasDriver = targetRoles.some((role) => DRIVER_ROLES.includes(role));
  if (hasKitchen && hasCleaning) return "Kitchen + cleaning";
  if (hasKitchen) return "Kitchen only";
  if (hasCleaning) return "Cleaning only";
  if (hasDriver) return "Driver dashboard";
  return targetRoles.map((role) => role.replace(/_/g, " ")).join(", ");
}

export function oneOffTaskNotificationLabel(kind: OneOffTaskKind): string {
  if (kind === "custom_kitchen") return "Kitchen task";
  if (kind === "custom_cleaning") return "Cleaning task";
  if (kind === "custom_driver") return "Driver route";
  return "Shared task";
}
