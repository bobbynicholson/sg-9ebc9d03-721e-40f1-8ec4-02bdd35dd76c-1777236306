import {
  addCatalogueFields,
  missingRequiredDish,
  publicMenuDishes,
  EMBED_MENU_FIELD_ID,
} from "@/lib/embed/catalogueSelection";

const menu = [
  { id: "lamb", item_name: "Lamb Spit", category: "Mains" },
  { id: "salad", item_name: "Coleslaw", category: "Salads" },
  { id: "waiter", item_name: "Waiter", category: "Service" },
  { id: "kids", item_name: "Kiddies Meals", category: "Mains" },
] as any[];

describe("menu required on public quote forms", () => {
  it("offers dishes only (no staffing, no kids meal)", () => {
    expect(publicMenuDishes(menu).map((d: any) => d.id)).toEqual(["lamb", "salad"]);
  });

  it("the menu question is required, added or saved", () => {
    const added = addCatalogueFields([] as any, "modern-inline", menu, [], "ZAR");
    expect(added.find((f) => f.id === EMBED_MENU_FIELD_ID)?.required).toBe(true);
    const saved = addCatalogueFields(
      [{ id: EMBED_MENU_FIELD_ID, type: "checkboxes", label: "Menu", required: false, visible: true, order: 1 }] as any,
      "modern-inline", menu, [], "ZAR",
    );
    expect(saved.find((f) => f.id === EMBED_MENU_FIELD_ID)?.required).toBe(true);
  });

  it("server refuses a request with no real dish picked", () => {
    expect(missingRequiredDish(menu, [])).toBe(true);
    expect(missingRequiredDish(menu, ["waiter"])).toBe(true);
    expect(missingRequiredDish(menu, ["not-a-dish"])).toBe(true);
    expect(missingRequiredDish(menu, ["salad"])).toBe(false);
  });

  it("never blocks a business that offers no dishes", () => {
    expect(missingRequiredDish([{ id: "w", item_name: "Waiter", category: "Service" }], [])).toBe(false);
    expect(missingRequiredDish([], [])).toBe(false);
  });
});
