export type DailyOperationsTitleKind = "kitchen_cleaning" | "equipment_cleaning";

const LEGACY_KITCHEN_TITLES = new Set(["daily kitchen clean", "daily kitchen cleaning"]);
const LEGACY_EQUIPMENT_TITLES = new Set([
  "daily kitchen-equipment clean",
  "daily kitchen equipment clean",
  "daily kitchen & equipment clean",
  "daily kitchen equipment cleaning",
]);

/** Replace only the previous built-in titles; preserve company-written titles. */
export function cleanDailyOperationsTaskTitle(kind: DailyOperationsTitleKind, title: string): string {
  const normalized = title.trim().toLowerCase();
  if (kind === "kitchen_cleaning" && LEGACY_KITCHEN_TITLES.has(normalized)) return "Kitchen area cleaning";
  if (kind === "equipment_cleaning" && LEGACY_EQUIPMENT_TITLES.has(normalized)) return "Kitchen equipment cleaning";
  return title;
}
