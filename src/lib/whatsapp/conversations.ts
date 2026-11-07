/** Paging helpers for the Replies page. Pure, so they can be tested directly. */
export interface ThreadMessage {
  id: string;
  direction: "in" | "out";
  text: string;
  at: string;
  status?: string;
  kind?: string;
  templateName?: string | null;
  templateLabel?: string | null;
  failureReason?: string | null;
}

export const CONVERSATION_PAGE_SIZE = 25;
export const MESSAGE_PAGE_SIZE = 30;

export function encodeCursor(row: { last_message_at: string; id: string }): string {
  return Buffer.from(JSON.stringify([row.last_message_at, row.id])).toString("base64url");
}

export function decodeCursor(cursor: string): { at: string; id: string } | null {
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const validDate = typeof at === "string" && !Number.isNaN(Date.parse(at));
    const validId = typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
    return validDate && validId ? { at, id } : null;
  } catch {
    return null;
  }
}

/** Removes characters that have meaning in a PostgREST filter. */
export function cleanSearch(value: unknown): string {
  return String(value || "").replace(/[%,()*\\]/g, " ").trim().slice(0, 60);
}

/**
 * Merges received and sent messages into one page, oldest first. Each list
 * holds up to size + 1 rows, newest first, so a spare row means there's more.
 */
export function mergeThreadPage(received: ThreadMessage[], sent: ThreadMessage[], size: number) {
  const newestFirst = [...received, ...sent].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  const page = newestFirst.slice(0, size);
  const oldestShown = page[page.length - 1];
  return {
    messages: page.reverse(),
    hasOlder: newestFirst.length > size,
    // Keep timestamp-only cursors for non-UUID callers; database message IDs
    // are UUIDs and let the inbox page accurately when several messages share
    // the same timestamp.
    olderCursor: newestFirst.length > size && oldestShown
      ? (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(oldestShown.id) ? `${oldestShown.at}|${oldestShown.id}` : oldestShown.at)
      : null,
  };
}

export function decodeThreadCursor(value: string): { at: string; id: string | null } | null {
  const separator = value.lastIndexOf("|");
  const at = separator >= 0 ? value.slice(0, separator) : value;
  const id = separator >= 0 ? value.slice(separator + 1) : null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(at) || Number.isNaN(Date.parse(at))) return null;
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  return { at, id };
}

/** Puts a fresh first page on top of what's loaded, without losing later pages. */
export function mergeConversations<T extends { phone: string }>(fresh: T[], existing: T[]): T[] {
  const phones = new Set(fresh.map((item) => item.phone));
  return [...fresh, ...existing.filter((item) => !phones.has(item.phone))];
}
