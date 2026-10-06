import { mapPayloadToLead, validateSubmission, type EmbedField } from "@/lib/embedFormApi";

const eventType: EmbedField = {
  id: "event_type",
  type: "select",
  label: "Event type",
  required: true,
  mapsTo: "event_name",
  options: [
    { value: "corporate", label: "Corporate / work function" },
    { value: "wedding", label: "Wedding" },
  ],
};

describe("embed submission rules", () => {
  it("stores the option label on the lead, not the internal code", () => {
    const lead = mapPayloadToLead([eventType], { event_type: "corporate" });
    expect(lead.event_type).toBe("Corporate / work function");
  });

  it("keeps unmapped answers on the lead notes", () => {
    const fields: EmbedField[] = [
      { id: "notes", type: "textarea", label: "Notes", mapsTo: "notes" },
      { id: "field_x1", type: "time", label: "Eating time" },
      { id: "extras", type: "checkboxes", label: "Extras", options: [{ value: "dj", label: "DJ" }] },
    ];
    const lead = mapPayloadToLead(fields, {
      notes: "Gate code 1234",
      field_x1: "18:30",
      extras: ["dj"],
      recurring_frequency: "monthly",
      menu_item_ids: ["uuid-1"],
    });
    expect(lead.notes).toContain("Gate code 1234");
    expect(lead.notes).toContain("Eating time: 18:30");
    expect(lead.notes).toContain("Extras: DJ");
    expect(lead.notes).toContain("Recurring frequency: monthly");
    expect(lead.notes).not.toContain("uuid-1");
  });

  it("accepts legacy string options", () => {
    const field = { ...eventType, options: ["Wedding", "Birthday"] } as EmbedField;
    expect(validateSubmission([field], { event_type: "Birthday" }).ok).toBe(true);
    expect(validateSubmission([field], { event_type: "Funeral" }).ok).toBe(false);
  });

  it("requires a required single checkbox to be ticked", () => {
    const terms: EmbedField = { id: "terms", type: "checkbox", label: "Terms", required: true };
    expect(validateSubmission([terms], { terms: false }).ok).toBe(false);
    expect(validateSubmission([terms], { terms: true }).ok).toBe(true);
  });

  it("never requires a field switched off in the customiser", () => {
    const hidden: EmbedField = { id: "budget", type: "number", label: "Budget", required: true, visible: false };
    expect(validateSubmission([hidden], {}).ok).toBe(true);
  });
});
