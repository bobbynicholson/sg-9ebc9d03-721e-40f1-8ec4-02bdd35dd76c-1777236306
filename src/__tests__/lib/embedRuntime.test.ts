import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeEmbedSubmitRequest } from "@/lib/embed/normalizeSubmitRequest";
import {
  addCatalogueFields,
  buildRequestedCatalogueItems,
  fieldsForRequestType,
  splitRequestedItems,
} from "@/lib/embed/catalogueSelection";
import { mapPayloadToLead, validateField } from "@/lib/embedFormApi";

const readAsset = (relativePath: string) =>
  readFileSync(join(process.cwd(), "public", "embed", relativePath), "utf8");

const loadRuntime = (...templates: string[]) => {
  delete (window as any).__cmsEmbedHelpers;
  delete (window as any).__cmsTemplates;
  window.eval(readAsset("helpers.js"));
  templates.forEach((template) => {
    window.eval(readAsset(`templates/${template}.js`));
  });
  return {
    helpers: (window as any).__cmsEmbedHelpers,
    templates: (window as any).__cmsTemplates,
  };
};

describe("embed request compatibility", () => {
  it("normalizes the canonical request body", () => {
    expect(
      normalizeEmbedSubmitRequest({
        formSlug: "quick-card",
        turnstileToken: "challenge",
        honeypot: "",
        referrer: "https://example.org/request",
      }),
    ).toEqual({
      formSlug: "quick-card",
      turnstileToken: "challenge",
      honeypot: "",
      referrer: "https://example.org/request",
    });
  });

  it("keeps already-installed legacy snippets working", () => {
    expect(
      normalizeEmbedSubmitRequest({
        slug: "pricing-calculator",
        turnstile_token: "legacy-challenge",
        client_meta: { referrer: "https://legacy.example/form" },
      }),
    ).toEqual({
      formSlug: "pricing-calculator",
      turnstileToken: "legacy-challenge",
      honeypot: "",
      referrer: "https://legacy.example/form",
    });
  });

  it("treats the advertised default slug as the tenant default form", () => {
    expect(normalizeEmbedSubmitRequest({ formSlug: "default" }).formSlug).toBeNull();
  });
});

describe("website embed runtime", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as any).fetch;
  });

  it("posts canonical submit keys and requests the selected pricing tier", async () => {
    const { helpers } = loadRuntime();
    const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response);
    (globalThis as any).fetch = fetchMock;

    await helpers.submitForm(
      "https://cateringms.com",
      "token",
      "quick-card",
      { name: "Test" },
      "challenge",
      "",
    );
    const submitBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(submitBody).toMatchObject({
      formSlug: "quick-card",
      turnstileToken: "challenge",
      payload: { name: "Test" },
    });
    expect(submitBody).not.toHaveProperty("slug");
    expect(submitBody).not.toHaveProperty("turnstile_token");

    await helpers.fetchEstimate("https://cateringms.com", "token", 50, "premium");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://cateringms.com/api/public/embed/token/estimate?guests=50&tierId=premium",
    );
  });

  it("applies saved snake_case form themes correctly", () => {
    const { helpers } = loadRuntime();
    const host = document.createElement("div");
    helpers.applyTheme(
      host,
      { primaryColor: "#000000", secondaryColor: "#111111" },
      {
        primary_color: "#9333ea",
        secondary_color: "#10b981",
        button_radius: "medium",
        font_family: "Inter",
      },
    );
    expect(host.style.getPropertyValue("--brand-primary")).toBe("#9333ea");
    expect(host.style.getPropertyValue("--brand-secondary")).toBe("#10b981");
    expect(host.style.getPropertyValue("--brand-radius")).toBe("12px");
    expect(host.style.getPropertyValue("--brand-font")).toBe("Inter");
  });

  it("renders all three active templates with the correct guest-count UX", () => {
    const { helpers, templates } = loadRuntime(
      "detailed-multi-step",
      "pricing-calculator",
      "quick-card",
    );
    const baseFields = [
      { id: "name", type: "text", label: "Name", required: true, visible: true, order: 1 },
      { id: "email", type: "email", label: "Email", required: true, visible: true, order: 2 },
      { id: "phone", type: "phone", label: "Phone", required: true, visible: true, order: 3 },
      {
        id: "event_type",
        type: "select",
        label: "Event type",
        required: true,
        visible: true,
        order: 4,
        options: [{ label: "Wedding", value: "wedding" }],
      },
      { id: "event_date", type: "date", label: "Date", required: true, visible: true, order: 5 },
      {
        id: "guest_count",
        type: "number",
        label: "Guests",
        required: true,
        visible: true,
        order: 6,
        validation: { min: 1, max: 10000 },
      },
    ];
    const config = {
      fields: baseFields,
      brand: { companyName: "Spit Braai Delivery" },
      tiers: [{ id: "classic", name: "Classic", price_per_person_min: 150, price_per_person_max: 210 }],
      currency: "ZAR",
    };
    const renderHelpers = {
      ...helpers,
      submit: jest.fn().mockResolvedValue({ ok: true }),
      estimate: jest.fn().mockResolvedValue({ ok: true, low: 7500, high: 10500 }),
      onSuccess: jest.fn(),
    };

    const detailedHost = document.createElement("div");
    templates["detailed-multi-step"].render(
      detailedHost,
      config,
      config.brand,
      renderHelpers,
    );
    expect(detailedHost.querySelectorAll(".cms-step")).toHaveLength(3);
    expect(
      detailedHost.querySelector('[data-step="1"] [data-fid="guest_count"]'),
    ).not.toBeNull();

    const pricingHost = document.createElement("div");
    templates["pricing-calculator"].render(
      pricingHost,
      {
        ...config,
        fields: [
          {
            id: "request_type",
            type: "radio",
            label: "How can we help?",
            required: true,
            visible: true,
            order: 0,
            options: [
              { label: "Quick enquiry", value: "enquiry" },
              { label: "Build quote", value: "quote" },
            ],
          },
          ...baseFields,
          { id: "tier", type: "select", label: "Tier", required: true, visible: true, order: 7 },
          {
            id: "menu_item_ids",
            type: "checkboxes",
            label: "Menu preferences",
            required: false,
            visible: true,
            order: 8,
            options: [
              { id: "unused", label: "Lamb Spit · R105", value: "menu-1" },
            ],
          },
        ],
      },
      config.brand,
      renderHelpers,
    );
    expect(pricingHost.querySelector('input[type="range"]')).not.toBeNull();
    expect(pricingHost.querySelector('[data-fid="guest_count"]')).toBeNull();
    expect(
      (pricingHost.querySelector(".cms-quote-details") as HTMLElement).style.display,
    ).toBe("none");
    const quoteMode = pricingHost.querySelector(
      'input[name="request_type"][value="quote"]',
    ) as HTMLInputElement;
    quoteMode.checked = true;
    quoteMode.dispatchEvent(new Event("change", { bubbles: true }));
    expect(
      (pricingHost.querySelector(".cms-quote-details") as HTMLElement).style.display,
    ).toBe("");
    const cataloguePicker = pricingHost.querySelector(
      '[data-fid="menu_item_ids"] .cms-catalogue-picker',
    );
    expect(cataloguePicker).not.toBeNull();
    const catalogueSelect = cataloguePicker!.querySelector("select") as HTMLSelectElement;
    catalogueSelect.value = "menu-1";
    catalogueSelect.dispatchEvent(new Event("change", { bubbles: true }));
    (cataloguePicker!.querySelector(".cms-catalogue-add") as HTMLButtonElement).click();
    expect(
      cataloguePicker!.querySelector(
        'input[name="menu_item_ids"][value="menu-1"]:checked',
      ),
    ).not.toBeNull();

    const quickHost = document.createElement("div");
    templates["quick-card"].render(quickHost, config, config.brand, renderHelpers);
    expect(quickHost.querySelectorAll("[data-fid]")).toHaveLength(baseFields.length);
  });
});

describe("catalogue-backed website quotes", () => {
  const menu = [{
    id: "menu-1",
    item_name: "Lamb Spit",
    base_price: 105,
    category: "Mains",
    sold_as_package: false,
  }];
  const equipment = [{
    id: "equipment-1",
    name: "Chafing dish",
    rental_price: 85,
    category: "Service",
  }];

  it("adds live choices only to quote-oriented templates", () => {
    const base = [{
      id: "email",
      type: "email" as const,
      label: "Email",
      required: true,
      visible: true,
      order: 1,
    }, {
      id: "venue",
      type: "text" as const,
      label: "Venue address",
      required: true,
      visible: true,
      order: 2,
      mapsTo: "venue" as const,
    }];
    const detailed = addCatalogueFields(
      base,
      "detailed-multi-step",
      menu,
      equipment,
      "ZAR",
    );
    expect(detailed.map((field) => field.id)).toEqual([
      "request_type",
      "email",
      "venue",
      "menu_item_ids",
      "equipment_item_ids",
    ]);
    expect(detailed.find((field) => field.id === "venue")?.conditional).toEqual({
      showIfFieldId: "request_type",
      showIfValue: "quote",
    });
    expect(
      addCatalogueFields(base, "quick-card", menu, equipment, "ZAR"),
    ).toEqual(base);
  });

  it("uses server catalogue pricing and does not scale equipment to guests", () => {
    const requested = buildRequestedCatalogueItems(menu, equipment, 40);
    expect(requested[0]).toMatchObject({
      item_type: "menu",
      quantity: 40,
      unit_price: 105,
      line_total: 4200,
    });
    expect(requested[1]).toMatchObject({
      item_type: "equipment",
      quantity: 1,
      unit_price: 85,
      line_total: 85,
    });
    const split = splitRequestedItems(requested);
    expect(split.menuItems).toHaveLength(1);
    expect(split.equipmentItems).toHaveLength(1);
  });

  it("prices a package once initially while keeping package quantity editable", () => {
    const requested = buildRequestedCatalogueItems(
      [{
        ...menu[0],
        id: "package-1",
        item_name: "On-site Lamb (feeds 25)",
        base_price: 4750,
        base_servings: 25,
        sold_as_package: true,
      }],
      [],
      40,
    );
    expect(requested[0]).toMatchObject({
      item_type: "menu",
      sold_as_package: true,
      pricing_mode: "per_portion",
      quantity: 1,
      unit_price: 4750,
      line_total: 4750,
    });
  });

  it("maps event_type and enforces nested saved validation rules", () => {
    expect(
      mapPayloadToLead(
        [{
          id: "event_type",
          type: "text",
          label: "Event",
          mapsTo: "event_type",
        }],
        { event_type: "Birthday" },
      ),
    ).toMatchObject({ event_type: "Birthday" });
    expect(
      validateField(
        {
          id: "guest_count",
          type: "number",
          label: "Guests",
          validation: { min: 10, max: 500 },
        },
        5,
      ),
    ).toMatchObject({ ok: false, error: "Minimum 10" });
  });

  it("does not require quote-only fields for a quick enquiry", () => {
    const storedFields = [
      {
        id: "email",
        type: "email" as const,
        label: "Email",
        required: true,
        visible: true,
        order: 1,
      },
      {
        id: "tier",
        type: "select" as const,
        label: "Menu tier",
        required: true,
        visible: true,
        order: 2,
      },
      {
        id: "venue",
        type: "text" as const,
        label: "Venue",
        required: true,
        visible: true,
        order: 3,
      },
    ];
    expect(
      fieldsForRequestType(storedFields, "enquiry").map((field) => field.id),
    ).toEqual(["email"]);
    expect(
      fieldsForRequestType(storedFields, "quote").map((field) => field.id),
    ).toEqual(["email", "tier", "venue"]);
  });
});
