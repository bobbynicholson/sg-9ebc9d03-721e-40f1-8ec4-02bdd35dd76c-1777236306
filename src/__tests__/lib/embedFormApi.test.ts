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

  it("validates and carries requested sitting details into lead notes", () => {
    const locations: EmbedField = { id: "delivery_locations", type: "locations", label: "Additional sitting locations" };
    const payload = { delivery_locations: [
      { name: "Cape Town office", address: "39 Salt River Road, Cape Town", guestCount: 45, serviceTime: "17:00" },
      { name: "Peninsula office", address: "Cape of Good Hope, Cape Town", guestCount: 45, serviceTime: "18:00" },
    ] };
    expect(validateSubmission([locations], payload).ok).toBe(true);
    expect(mapPayloadToLead([locations], payload).notes).toContain("1. Cape Town office — 39 Salt River Road, Cape Town\n   Guests: 45\n   Service time: 17:00\n2. Peninsula office — Cape of Good Hope, Cape Town\n   Guests: 45\n   Service time: 18:00");
    expect(mapPayloadToLead([locations], payload).guest_count).toBe(90);
    expect(validateSubmission([locations], { delivery_locations: [{ name: "Cape Town office", address: "" }] }).errors?.delivery_locations).toMatch(/enter an address/i);
    expect(validateSubmission([locations], { delivery_locations: [{ name: "Cape Town office", address: "39 Salt River Road" }] }).errors?.delivery_locations).toMatch(/guest count/i);
  });

  it("checks requested sitting guests against the main venue and event total", () => {
    const fields: EmbedField[] = [
      { id: "guest_count", type: "number", label: "Total guests", mapsTo: "guest_count" },
      { id: "venue", type: "text", label: "Main venue", mapsTo: "venue" },
      { id: "delivery_locations", type: "locations", label: "Additional sitting locations" },
    ];
    const base = { guest_count: 90, venue: "Main venue, Cape Town" };
    expect(validateSubmission(fields, { ...base, delivery_locations: [{ address: "Office 2", guestCount: 45 }] }).ok).toBe(true);
    expect(validateSubmission(fields, { ...base, delivery_locations: [{ address: "Office 2", guestCount: 90 }] }).errors?.delivery_locations).toMatch(/leave at least one guest/i);
    expect(validateSubmission(fields, { guest_count: 90, delivery_locations: [{ address: "Office 1", guestCount: 45 }] }).errors?.delivery_locations).toMatch(/add up to 90/i);
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

  it("includes selected menu and equipment with quantities, without unconfirmed prices", () => {
    const body = ensureLeadLinkInEmailBody(
      "New lead from your website form.\nName: Fiona Collins\nGuests: 25",
      "https://app.example.com/admin/leads?leadId=lead-1",
      [
        { item_type: "menu", item_name: "Roast lamb", category: "Mains", quantity: 25, unit_price: 350 },
        { item_type: "equipment", item_name: "Dinner plates", category: "Crockery", quantity: 25, unit_price: 8 },
      ],
      { clientName: "Fiona Collins", companyName: "Spit Braai Delivery", eventType: "Wedding", eventDate: "7 February 2027", guestCount: 25 },
    );
    expect(body).toContain("Customer selections <span");
    expect(body).toContain("Fiona Collins</h1>");
    expect(body).toContain("Wedding");
    expect(body).toContain("Roast lamb");
    expect(body).toContain("Dinner plates");
    expect(body).toContain("Qty 25");
    expect(body).toContain("confirm availability and pricing");
    expect(body).not.toContain("350");
    expect(body).not.toContain("unit_price");
  });

  it("adds selected items to a custom HTML admin email and escapes catalogue names", () => {
    const body = ensureLeadLinkInEmailBody(
      "<p>A new enquiry arrived.</p>",
      "https://app.example.com/admin/leads?leadId=lead-1",
      [{ item_type: "menu", item_name: "<script>alert(1)</script>", quantity: 1 }],
    );
    expect(body).toContain("Customer selections <span");
    expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body).not.toContain("<script>alert(1)</script>");
    expect(body).toContain("Open lead in CateringMS");
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
