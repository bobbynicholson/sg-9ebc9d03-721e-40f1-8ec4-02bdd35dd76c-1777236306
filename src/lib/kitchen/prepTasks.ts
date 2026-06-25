export type KitchenPrepTaskLike = {
  id: string;
  task_type?: string | null;
  status?: string | null;
  start_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  station_id?: string | null;
  duration_min?: number | null;
  menu_item_name?: string | null;
};

export function normaliseKitchenPrepTaskType(value: string | null | undefined): string {
  const raw = String(value || "task")
    .toLowerCase()
    .replace(/[_/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) return "task";
  if (raw.includes("prep") && raw.includes("cook")) return "prep_and_cook";
  if (raw === "prep") return "prep";
  if (raw === "cook") return "cook";
  return raw.replace(/\s+/g, "_");
}

export function formatKitchenPrepTaskType(value: string | null | undefined): string {
  const normalised = normaliseKitchenPrepTaskType(value);
  if (normalised === "prep_and_cook") return "Prep and cook";
  return normalised
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Task";
}

function taskWeight<T extends KitchenPrepTaskLike>(task: T): number {
  const status = String(task.status || "").toLowerCase();
  if (task.completed_at) return 50;
  if (status === "done" || status === "completed") return 40;
  if (status === "in_progress") return 30;
  if (task.started_at) return 20;
  return 10;
}

export function dedupeKitchenPrepTasks<T extends KitchenPrepTaskLike>(rows: T[]): T[] {
  const byKey = new Map<string, T>();

  for (const row of rows) {
    const key = [
      normaliseKitchenPrepTaskType(row.task_type),
      String(row.menu_item_name || "").trim().toLowerCase(),
      row.station_id || "",
      row.start_at || "",
      row.duration_min == null ? "" : String(row.duration_min),
    ].join("|");

    const current = byKey.get(key);
    if (!current || taskWeight(row) > taskWeight(current)) {
      byKey.set(key, row);
    }
  }

  return Array.from(byKey.values());
}
