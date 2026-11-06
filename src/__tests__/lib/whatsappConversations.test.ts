/**
 * @jest-environment node
 */
import {
  cleanSearch,
  decodeCursor,
  encodeCursor,
  mergeConversations,
  mergeThreadPage,
  type ThreadMessage,
} from "@/lib/whatsapp/conversations";
import { WHATSAPP_AUTOMATIONS, WHATSAPP_MANUAL_ONLY, WHATSAPP_SEND_FROM } from "@/lib/whatsapp/automations";

const id = "123e4567-e89b-12d3-a456-426614174000";
const message = (n: number, direction: "in" | "out"): ThreadMessage => ({
  id: `${direction}${n}`, direction, text: `m${n}`, at: `2026-11-05T09:${String(n).padStart(2, "0")}:00.000Z`,
});

describe("conversation paging", () => {
  it("round-trips a cursor", () => {
    expect(decodeCursor(encodeCursor({ last_message_at: "2026-11-05T09:00:00.000Z", id }))).toEqual({ at: "2026-11-05T09:00:00.000Z", id });
  });

  it("ignores a tampered cursor rather than putting it in a query", () => {
    expect(decodeCursor("nonsense")).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify(["x),or(a.eq.1", id])).toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify(["2026-11-05", "1) or 1=1"])).toString("base64url"))).toBeNull();
  });

  it("strips characters that would change a search filter", () => {
    expect(cleanSearch("sam,id.eq.1)")).toBe("sam id.eq.1");
    expect(cleanSearch("a".repeat(100))).toHaveLength(60);
  });

  it("merges sent and received messages in time order, oldest first", () => {
    const page = mergeThreadPage([message(3, "in"), message(1, "in")], [message(2, "out")], 30);
    expect(page.messages.map((item) => item.id)).toEqual(["in1", "out2", "in3"]);
    expect(page.hasOlder).toBe(false);
  });

  it("keeps the newest page and points to where older messages start", () => {
    const received = [message(5, "in"), message(3, "in"), message(1, "in")];
    const sent = [message(4, "out"), message(2, "out")];
    const page = mergeThreadPage(received, sent, 3);
    expect(page.messages.map((item) => item.id)).toEqual(["in3", "out4", "in5"]);
    expect(page.hasOlder).toBe(true);
    expect(page.olderCursor).toBe(message(3, "in").at);
  });

  it("puts fresh conversations on top without losing loaded pages", () => {
    const merged = mergeConversations([{ phone: "2", n: "new" }], [{ phone: "1", n: "a" }, { phone: "2", n: "old" }, { phone: "3", n: "c" }]);
    expect(merged.map((item) => `${item.phone}${item.n}`)).toEqual(["2new", "1a", "3c"]);
  });
});

describe("direct send links", () => {
  it("every message the app has a direct button for points to a real admin page", () => {
    for (const target of Object.values(WHATSAPP_SEND_FROM)) expect(target.href).toMatch(/^\/admin\//);
    const known = new Set([...WHATSAPP_AUTOMATIONS, ...WHATSAPP_MANUAL_ONLY].map((item) => item.key as string));
    for (const key of Object.keys(WHATSAPP_SEND_FROM)) expect(known.has(key)).toBe(true);
  });
});
