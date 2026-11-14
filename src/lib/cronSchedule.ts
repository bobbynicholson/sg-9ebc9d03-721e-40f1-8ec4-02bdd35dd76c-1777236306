import vercelConfig from "../../vercel.json";

export type ScheduledCron = { path: string; schedule: string; taskKey: string };

const configuredCrons = (vercelConfig as { crons?: Array<{ path: string; schedule: string }> }).crons || [];

export const scheduledCrons: ScheduledCron[] = configuredCrons.map(({ path, schedule }) => ({
  path,
  schedule,
  taskKey: path.split("/").filter(Boolean).pop() || path,
}));

function normalizedValue(value: number, isDayOfWeek: boolean) {
  return isDayOfWeek && value === 7 ? 0 : value;
}

function fieldMatches(value: number, expression: string, min: number, max: number, isDayOfWeek = false) {
  if (expression === "*") return true;
  return expression.split(",").some((part) => {
    const [range, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step < 1) return false;
    let start = min;
    let end = max;
    if (range !== "*") {
      const bounds = range.split("-").map(Number);
      if (bounds.some((bound) => !Number.isInteger(bound))) return false;
      start = bounds[0];
      end = bounds.length > 1 ? bounds[1] : bounds[0];
      if (start < min || end > max || start > end) return false;
    }
    for (let candidate = start; candidate <= end; candidate += step) {
      if (normalizedValue(candidate, isDayOfWeek) === normalizedValue(value, isDayOfWeek)) return true;
    }
    return false;
  });
}

function cronMatches(schedule: string, date: Date) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const matchesDate = fieldMatches(date.getUTCDate(), dayOfMonth, 1, 31);
  const matchesWeekday = fieldMatches(date.getUTCDay(), dayOfWeek, 0, 7, true);
  const dayMatches = dayOfMonth === "*"
    ? matchesWeekday
    : dayOfWeek === "*"
      ? matchesDate
      : matchesDate || matchesWeekday;
  return fieldMatches(date.getUTCMinutes(), minute, 0, 59)
    && fieldMatches(date.getUTCHours(), hour, 0, 23)
    && dayMatches
    && fieldMatches(date.getUTCMonth() + 1, month, 1, 12);
}

/** Vercel cron schedules use UTC. Returns the first scheduled minute strictly after `after`. */
export function nextCronRun(schedule: string, after = new Date()): Date | null {
  const candidate = new Date(after);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  const maxMinutes = 367 * 24 * 60;
  for (let minute = 0; minute < maxMinutes; minute += 1) {
    if (cronMatches(schedule, candidate)) return candidate;
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return null;
}

export function cronIntervalMs(schedule: string, after = new Date()): number {
  const first = nextCronRun(schedule, after);
  const second = first ? nextCronRun(schedule, first) : null;
  return first && second ? second.getTime() - first.getTime() : 24 * 60 * 60 * 1000;
}
