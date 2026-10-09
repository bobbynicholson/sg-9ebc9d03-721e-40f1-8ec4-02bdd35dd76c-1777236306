/**
 * Menu courses: one shared mapping from any stored category label
 * ("Mains", "starter", "Salads", "appetizer"...) to a course key, plus
 * the serving order and headings. Used to group menu lines by course on
 * quotes and orders the same way the website quote form does.
 */

export type CourseKey =
  | "starter"
  | "main"
  | "side"
  | "salad"
  | "dessert"
  | "beverage"
  | "service"
  | "other";

export const COURSE_ORDER: CourseKey[] = [
  "starter", "main", "side", "salad", "dessert", "beverage", "service", "other",
];

export const COURSE_HEADINGS: Record<CourseKey, string> = {
  starter: "Starters",
  main: "Mains",
  side: "Sides",
  salad: "Salads",
  dessert: "Desserts",
  beverage: "Beverages",
  service: "Service",
  other: "Other",
};

export function courseOf(raw: string | null | undefined): CourseKey {
  const c = String(raw || "").toLowerCase().trim();
  if (!c) return "other";
  if (/^(starter|appeti[sz]er|canap)/.test(c)) return "starter";
  if (/^main/.test(c)) return "main";
  if (/^side/.test(c)) return "side";
  if (/^salad/.test(c)) return "salad";
  if (/^(dessert|pudding|sweet)/.test(c)) return "dessert";
  if (/^(beverage|drink)/.test(c)) return "beverage";
  if (/^(service|staff|waiter|chef)/.test(c)) return "service";
  return "other";
}

/**
 * Put menu lines into the course sequence used when a quote is created.
 * The original index is the tie-breaker, so dishes remain in the order the
 * operator entered them inside a course.
 */
export function sortByCourse<T>(
  items: T[],
  categoryOf: (item: T) => string | null | undefined,
): T[] {
  const rank = new Map(COURSE_ORDER.map((course, index) => [course, index]));
  return items
    .map((item, index) => ({ item, index, rank: rank.get(courseOf(categoryOf(item))) ?? COURSE_ORDER.length }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}

/** Group items by course, in serving order, skipping empty courses. */
export function groupByCourse<T>(
  items: T[],
  categoryOf: (item: T) => string | null | undefined,
): { course: CourseKey; heading: string; items: T[] }[] {
  const orderedItems = sortByCourse(items, categoryOf);
  const buckets = new Map<CourseKey, T[]>();
  for (const item of orderedItems) {
    const key = courseOf(categoryOf(item));
    const list = buckets.get(key) || [];
    list.push(item);
    buckets.set(key, list);
  }
  return COURSE_ORDER
    .filter((k) => (buckets.get(k) || []).length > 0)
    .map((k) => ({ course: k, heading: COURSE_HEADINGS[k], items: buckets.get(k) || [] }));
}

/** Group by a free-text category (equipment), alphabetical, "Other" last. */
export function groupByCategory<T>(
  items: T[],
  categoryOf: (item: T) => string | null | undefined,
): { heading: string; items: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const raw = String(categoryOf(item) || "").trim();
    const key = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Other";
    const list = buckets.get(key) || [];
    list.push(item);
    buckets.set(key, list);
  }
  return Array.from(buckets.keys())
    .sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)))
    .map((heading) => ({ heading, items: buckets.get(heading) || [] }));
}
