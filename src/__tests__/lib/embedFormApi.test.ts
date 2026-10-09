import { mapPayloadToLead, validateSubmission, type EmbedField } from "@/lib/embedFormApi";
import { LEAD_EVENT_TYPE_OPTIONS, normalizeLeadEventTypeOptions } from "@/lib/leadEventTypes";
import { ensureLeadLinkInEmailBody, uniqueAdminEmails } from "@/lib/embed/notifyAdminOfEmbedLead";

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

  it.each(LEAD_EVENT_TYPE_OPTIONS)("stores the selected $label event title on the lead", ({ value, label }) => {
    const [field] = normalizeLeadEventTypeOptions([eventType]);
    const lead = mapPayloadToLead([field], { event_type: value });
    expect(lead.event_type).toBe(label);
  });

  it("adds a direct lead link when a custom admin email template omits one", () => {
    const link = "https://app.example.com/admin/leads?leadId=lead-1";
    expect(ensureLeadLinkInEmailBody("A new enquiry arrived.", link)).toContain(`href="${link}"`);
    const withExistingAnchor = ensureLeadLinkInEmailBody(`<a href="${link}">View lead</a>`, link);
    expect(withExistingAnchor.match(/href=/g)).toHaveLength(1);
  });

  it("formats a plain lead email into distinct, labelled sections", () => {
    const body = ensureLeadLinkInEmailBody(
      "New lead from your website form.\nName: Fiona Collins\nEmail: fiona@example.com\nPhone: 0655031989\nEvent: Confirmation\nDate: 7 February 2027\nGuests: 60\nVenue: Grotto Bay\nNotes: Other details from the form:\nEating time: 13:00\nEquipment: Plate, knife, fork, bowl and spoon\nChildren: 10 kids\nTable services requested: On-site chef",
      "https://app.example.com/admin/leads?leadId=lead-1",
    );
    expect(body).toContain("Contact</h2>");
    expect(body).toContain("Event details</h2>");
    expect(body).toContain("Catering request</h2>");
    expect(body).toContain("Equipment</th>");
    expect(body).toContain("Children</th>");
    expect(body).not.toContain("Other details from the form");
    expect(body).toContain("Open lead in CateringMS");
    expect(body).toContain("<table");
  });

  it("sends once to each distinct admin email address", () => {
    expect(uniqueAdminEmails([
      "owner@example.com",
      "admin@example.com",
      " ADMIN@example.com ",
      null,
    ])).toEqual(["owner@example.com", "admin@example.com"]);
  });
});
