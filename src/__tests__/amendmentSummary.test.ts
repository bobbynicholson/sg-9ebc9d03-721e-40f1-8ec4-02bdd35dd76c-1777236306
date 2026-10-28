// The order page summarises client change requests in plain words.
// Shape taken from a real approved amendment (names/prices only).
import { summariseAmendment, summaryPhrases, historyActionLabel, amendmentNextSteps } from "@/lib/amendmentSummary";

const before = {
  guest_count: 28,
  menu_items: [
    { item_name: "Lamb Spit", quantity: 1, unit_price: 4565.22, pricing_mode: "flat" },
    { item_name: "Baby Potatoes", menu_item_id: "m-potato", quantity: 28, unit_price: 6.52, pricing_mode: "per_person" },
    { item_name: "Garlic Bread", menu_item_id: "m-garlic", quantity: 28, unit_price: 6.52, pricing_mode: "per_person" },
    { item_name: "Cutlery & Crockery", quantity: 28, unit_price: 6.08, pricing_mode: "per_person" },
  ],
  equipment_items: [
    { name: "Plate 25cm", equipment_id: "e-plate", quantity: 28, unit_price: 0 },
  ],
};

const proposed = {
  guest_count: 28,
  menu_items: [
    { item_name: "Lamb Spit", quantity: 1, unit_price: 4565.22, pricing_mode: "per_portion" },
    // Per-person quantity 0 = one per guest, so these are unchanged.
    { item_name: "Garlic Bread", menu_item_id: "m-garlic", quantity: 0, unit_price: 6.52, pricing_mode: "per_person" },
    { item_name: "Cutlery & Crockery", quantity: 0, unit_price: 6.08, pricing_mode: "per_person" },
    { item_name: "Green Salad", menu_item_id: "m-salad", quantity: 0, unit_price: 17.5, pricing_mode: "per_person" },
  ],
  equipment_items: [
    { name: "Plate 25cm", equipment_id: "e-plate", quantity: 28, unit_price: 2.5 },
  ],
};

describe("amendment summary", () => {
  const s = summariseAmendment(proposed, before);

  it("reads per-guest quantities as one per guest, not zero", () => {
    expect(s.menu.find((c) => c.name === "Garlic Bread")).toBeUndefined();
    expect(s.menu.find((c) => c.name === "Cutlery & Crockery")).toBeUndefined();
    expect(s.menu).toContainEqual(expect.objectContaining({ kind: "added", name: "Green Salad", after: expect.objectContaining({ quantity: "28 (per guest)" }) }));
  });

  it("lists removed items and price changes, and leaves unchanged guests out", () => {
    expect(s.menu).toContainEqual(expect.objectContaining({ kind: "removed", name: "Baby Potatoes" }));
    expect(s.equipment).toEqual([expect.objectContaining({ kind: "changed", name: "Plate 25cm" })]);
    expect(s.guests).toBeNull();
  });

  it("builds short phrases for the row", () => {
    const text = summaryPhrases(s).map((p) => `${p.verb} ${p.subject}`);
    expect(text).toEqual(expect.arrayContaining(["Added Green Salad", "Removed Baby Potatoes", "Changed Plate 25cm"]));
  });

  it("lists a pending request's items when there is nothing to compare against", () => {
    const pending = summariseAmendment({ guest_count: 30, menu_items: proposed.menu_items }, null);
    expect(pending.guests).toEqual({ before: null, after: 30 });
    expect(pending.requestedMenu.map((l) => l.name)).toContain("Green Salad");
  });

  it("names history actions in plain words", () => {
    expect(historyActionLabel("amendment_requested_magic")).toBe("Client requested a change (via their link)");
    expect(historyActionLabel("amendment_approved")).toBe("Change request approved");
    expect(historyActionLabel("some_new_action")).toBe("Some new action");
  });
});

describe("what the team should do", () => {
  const s = summariseAmendment(proposed, before);
  it("points kitchen, equipment and finance at the changed items once approved", () => {
    const steps = amendmentNextSteps(s, "approved");
    expect(steps.map((x) => x.lead)).toEqual([
      expect.stringContaining("Kitchen and shopping"),
      expect.stringContaining("Equipment"),
      expect.stringContaining("Finance"),
    ]);
    expect(steps[0].items).toEqual(expect.arrayContaining(["Green Salad", "Baby Potatoes"]));
  });
  it("asks for a decision first on a pending request", () => {
    expect(amendmentNextSteps(s, "pending")[0].lead).toMatch(/approve or decline/);
  });
  it("only asks to tell the client when declined", () => {
    expect(amendmentNextSteps(s, "rejected")).toHaveLength(1);
  });
});
