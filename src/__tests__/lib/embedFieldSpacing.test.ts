/**
 * "Space between fields" must reach every question in every form style.
 * Questions sit in the standard .cms-field wrapper (spaced by --field-gap),
 * or in a style's own block whose bottom spacing also uses --field-gap.
 * A new question type outside both fails this test.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "public", "embed");
const TEMPLATES = readdirSync(join(dir, "templates")).filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, ""));

// Each style's own question blocks (outside .cms-field) and the CSS class
// that carries the spacing after them.
const CUSTOM_BLOCKS: Record<string, Array<{ container: string; spacedBy: string }>> = {
  "pricing-calculator": [{ container: ".cms-calc", spacedBy: ".cms-calc" }],
  "corporate-catering": [{ container: ".cms-tier-grid", spacedBy: ".cms-tier-grid" }],
  "event-estimator": [
    { container: ".cms-numpad", spacedBy: ".cms-num-label" },
    { container: ".cms-tier-grid", spacedBy: ".cms-tier-grid" },
  ],
  "wedding-specialist": [
    { container: ".cms-dietary", spacedBy: ".cms-dietary" },
    { container: ".cms-checkbox-row", spacedBy: ".cms-checkbox-row" },
  ],
};

function load() {
  delete (window as any).__cmsEmbedHelpers;
  delete (window as any).__cmsTemplates;
  window.eval(readFileSync(join(dir, "helpers.js"), "utf8"));
  TEMPLATES.forEach((t) => window.eval(readFileSync(join(dir, "templates", `${t}.js`), "utf8")));
  return { helpers: (window as any).__cmsEmbedHelpers, templates: (window as any).__cmsTemplates };
}

const fields = [
  { id: "name", type: "text", label: "Name", required: true, visible: true, order: 1 },
  { id: "email", type: "email", label: "Email", required: true, visible: true, order: 2 },
  { id: "phone", type: "phone", label: "Phone", required: true, visible: true, order: 3 },
  { id: "event_date", type: "date", label: "Date", required: true, visible: true, order: 4 },
  { id: "guest_count", type: "number", label: "Guests", required: true, visible: true, order: 5 },
  { id: "menu_item_ids", type: "checkboxes", label: "Menu", required: true, visible: true, order: 6,
    options: [{ value: "a", label: "Lamb", group: "Mains" }, { value: "b", label: "Salad", group: "Salads" }] },
  { id: "notes", type: "textarea", label: "Notes", required: false, visible: true, order: 7 },
];

describe("space between fields reaches every form style", () => {
  const { helpers, templates } = load();
  const rh = { ...helpers, submit: jest.fn(), estimate: jest.fn().mockResolvedValue({ ok: true, low: 1, high: 2 }) };
  const config = {
    fields, brand: { companyName: "X" }, theme: { field_spacing: "extra" }, currency: "ZAR",
    tiers: [{ id: "c", name: "Classic", price_per_person_min: 1, price_per_person_max: 2 }],
  };

  it("covers all 10 styles", () => {
    expect(TEMPLATES.length).toBe(10);
  });

  it.each(TEMPLATES)("%s: every question is spaced by the setting", (t) => {
    const host = document.createElement("div");
    templates[t].render(host, config, config.brand, rh);
    const blocks = CUSTOM_BLOCKS[t] || [];
    const outside = Array.from(host.querySelectorAll("input,select,textarea")).filter((n: any) =>
      n.type !== "hidden" && n.name !== "website" && !n.classList.contains("cms-sr") && !n.closest(".cms-field"));
    for (const n of outside) {
      const block = blocks.find((b) => (n as Element).closest(b.container));
      expect({ style: t, control: (n as any).name || (n as any).id || (n as any).type, inKnownBlock: !!block })
        .toEqual({ style: t, control: (n as any).name || (n as any).id || (n as any).type, inKnownBlock: true });
    }
    const css = readFileSync(join(dir, "templates", `${t}.js`), "utf8");
    for (const b of blocks) {
      // The block's own CSS rule ('.cms-calc{...}') must use the setting.
      const start = css.indexOf(`'${b.spacedBy}{`);
      const end = start >= 0 ? css.indexOf("'", start + 1) : -1;
      const rule = start >= 0 ? css.slice(start, end) : "";
      expect({ style: t, block: b.spacedBy, usesSetting: rule.includes("var(--field-gap") })
        .toEqual({ style: t, block: b.spacedBy, usesSetting: true });
    }
  });

  it("standard questions use the setting, defaulting to today's 16px", () => {
    const css = readFileSync(join(dir, "helpers.js"), "utf8");
    expect(css).toContain("'.cms-field{display:flex;flex-direction:column;gap:7px;margin-bottom:var(--field-gap,16px)}'");
  });
});
