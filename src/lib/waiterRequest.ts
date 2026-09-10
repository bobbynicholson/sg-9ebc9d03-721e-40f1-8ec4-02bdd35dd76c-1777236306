const WAITER_REQUEST_RE =
  /\b(waiter|waitress|server|servers|serving staff|service staff|on[-\s]?site staff|table service|food service)\b/i;

function collectText(value: unknown, out: string[] = []): string[] {
  if (value == null) return out;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out);
    return out;
  }
  if (typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectText(nested, out);
    }
  }
  return out;
}

export function textMentionsWaiterService(...values: unknown[]): boolean {
  const text = values.flatMap((value) => collectText(value)).join(" ");
  return WAITER_REQUEST_RE.test(text);
}

export function waiterRequestSummary(...values: unknown[]): string {
  const text = values
    .flatMap((value) => collectText(value))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}
