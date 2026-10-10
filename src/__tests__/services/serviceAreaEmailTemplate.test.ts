import { TEMPLATE_REGISTRY, renderTemplate } from "@/lib/messageTemplates/registry";

describe("outside-service-area lead email", () => {
  it("renders company base, served areas, unavailable areas, and expansion notice", () => {
    const template = TEMPLATE_REGISTRY.find((entry) => entry.key === "email_lead_outside_service_area");
    expect(template).toBeDefined();

    const body = renderTemplate(template!.defaultBody, {
      first_name: "Jordan",
      tenant_name: "Coast Caterers",
      company_name: "Coast Caterers",
      from_name: "Callum",
      event_name: "your event",
      event_date: "your date",
      guest_count: "",
      service_area_intro: "we are a Cape Town based company servicing Western Cape only",
      service_area_limit_sentence: "as we have not managed to get to Gauteng yet.",
      service_areas: "Western Cape",
      unavailable_areas: "Gauteng",
      future_service_areas_sentence: "Alternatively, we will notify you once we are up and running in Gauteng.\n\n",
    });

    expect(body).toContain("Hi Jordan,");
    expect(body).toContain("Thanks for your enquiry; however, we are a Cape Town based company servicing Western Cape only as we have not managed to get to Gauteng yet.");
    expect(body).toContain("If you're ever hosting a function in Western Cape, we'd love to quote you!");
    expect(body).toContain("Alternatively, we will notify you once we are up and running in Gauteng.");
    expect(body).toContain("Regards,\nCallum\n\nCoast Caterers");
    expect(body).not.toMatch(/\{\{[^}]+\}\}/);
  });
});
