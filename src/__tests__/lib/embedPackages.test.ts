import {
  addCatalogueFields,
  buildRequestedCatalogueItems,
  defaultEquipmentPackages,
  resolveEquipmentPackages,
  splitRequestedItems,
} from "@/lib/embed/catalogueSelection";

const equipment = [
  { id: "plate20", name: "Plate 20cm", rental_price: 2.5, category: "Crockery" },
  { id: "plate25", name: "Plate 25cm", rental_price: 2.5, category: "Crockery" },
  { id: "knife", name: "Stainless Steel Knife", rental_price: 2, category: "Cutlery" },
  { id: "fork", name: "Stainless Steel Fork", rental_price: 2, category: "Cutlery" },
  { id: "spoon", name: "Stainless Steel Spoon", rental_price: 2, category: "Cutlery" },
  { id: "bowlP", name: "Bowl (plastic)", rental_price: 2.5, category: "Crockery" },
  { id: "bowl", name: "Bowl (porcelain)", rental_price: 2.5, category: "Crockery" },
  { id: "salad", name: "Salad Bowl (medium)", rental_price: 0, category: "Other" },
];
const menu = [
  { id: "m1", item_name: "Spicy Beef Strips", base_price: 50, category: "Starters" },
  { id: "m2", item_name: "Lamb Spit Full Portion", base_price: 105, category: "Mains" },
];

describe("equipment place-setting packages", () => {
  it("builds the two packages from catalogue pieces", () => {
    const pkgs = defaultEquipmentPackages(equipment as any);
    expect(pkgs.map((p) => p.label)).toEqual(["Plate, knife & fork", "Plate, knife, fork, bowl & spoon"]);
    expect(pkgs[0].items).toEqual(["plate20", "knife", "fork"]);
    // Uses the requested 20cm plate and porcelain bowl; never a salad bowl.
    expect(pkgs[1].items).toEqual(["plate20", "knife", "fork", "bowl", "spoon"]);
  });

  it("falls back to available pieces when another tenant has no 20cm plate", () => {
    expect(defaultEquipmentPackages(equipment.filter((e) => e.id !== "plate20"))[0].items)
      .toEqual(["plate25", "knife", "fork"]);
  });

  it.each([0, 1])("preserves package %i through unordered database results into the quote", (packageIndex) => {
    const pkg = defaultEquipmentPackages(equipment)[packageIndex];
    // Actual production result order was Fork, Bowl, Plate, Knife, Spoon.
    const databaseRows = [equipment[3], equipment[6], equipment[0], equipment[2], equipment[4]]
      .filter((row) => pkg.items.includes(row.id));
    const requested = buildRequestedCatalogueItems(menu, databaseRows, 40, new Set(pkg.items));
    const { menuItems, equipmentItems } = splitRequestedItems(requested);
    expect(equipmentItems.map((row) => row.equipment_id)).toEqual(pkg.items);
    expect(equipmentItems.map((row) => row.name)).toEqual(packageIndex === 0
      ? ["Plate 20cm", "Stainless Steel Knife", "Stainless Steel Fork"]
      : ["Plate 20cm", "Stainless Steel Knife", "Stainless Steel Fork", "Bowl (porcelain)", "Stainless Steel Spoon"]);
    expect(equipmentItems.every((row) => row.quantity === 40 && row.line_total === row.unit_price * 40)).toBe(true);
    expect(equipmentItems.reduce((sum, row) => sum + row.line_total, 0)).toBe(packageIndex === 0 ? 260 : 440);
    expect(menuItems.map((row) => row.menu_item_id)).toEqual(["m1", "m2"]);
  });

  it("corrects saved standard package order without replacing the selected equipment", () => {
    const fields = [{ id: "equipment_package", options: [{ value: "plate_knife_fork_bowl_spoon", items: ["fork", "bowl", "plate25", "knife", "spoon"] }] }];
    expect(resolveEquipmentPackages(fields as any, equipment)[0].items)
      .toEqual(["plate25", "knife", "fork", "bowl", "spoon"]);
    fields[0].options[0].value = "custom";
    expect(resolveEquipmentPackages(fields as any, equipment)[0].items)
      .toEqual(["fork", "bowl", "plate25", "knife", "spoon"]);
  });

  it("offers only the first package when bowls or spoons are missing", () => {
    const pkgs = defaultEquipmentPackages(equipment.filter((e) => e.id !== "spoon") as any);
    expect(pkgs.map((p) => p.value)).toEqual(["plate_knife_fork"]);
  });

  it("offers none without plates, knives and forks", () => {
    expect(defaultEquipmentPackages([{ id: "x", name: "Chafing dish", rental_price: 85 }] as any)).toEqual([]);
  });

  it("uses packages saved on the form, dropping deleted pieces", () => {
    const saved = [{
      id: "equipment_package", type: "select", label: "Cutlery", required: false, visible: true, order: 1,
      options: [{ value: "custom", label: "Knife & fork only", items: ["knife", "fork", "gone"] }],
    }];
    const pkgs = resolveEquipmentPackages(saved as any, equipment as any);
    expect(pkgs).toEqual([{ value: "custom", label: "Knife & fork only", items: ["knife", "fork"] }]);
  });

  it("puts a package dropdown (not the piece picker) and a grouped menu on the form", () => {
    const fields = addCatalogueFields([], "quick-card", menu as any, equipment as any, "ZAR");
    const pkgField = fields.find((f) => f.id === "equipment_package");
    expect(pkgField?.type).toBe("select");
    expect(pkgField?.label).toBe("Equipment");
    expect(fields.some((f) => f.id === "equipment_item_ids")).toBe(false);
    const menuField = fields.find((f) => f.id === "menu_item_ids");
    expect((menuField?.options as any[]).map((o) => o.group)).toEqual(["Starters", "Mains"]);
  });

  it("prices package pieces one per guest; individually picked equipment stays at 1", () => {
    const items = buildRequestedCatalogueItems(
      [],
      [equipment[1], equipment[2], { id: "chafe", name: "Chafing dish", rental_price: 85 }] as any,
      40,
      new Set(["plate25", "knife"]),
    );
    expect(items.map((i) => [i.equipment_id, i.quantity, i.line_total])).toEqual([
      ["plate25", 40, 100],
      ["knife", 40, 80],
      ["chafe", 1, 85],
    ]);
  });

  it("adds waiter and on-site chef tick boxes, unless the form switched one off", () => {
    const ids = addCatalogueFields([], "quick-card", menu as any, equipment as any, "ZAR").map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["waiter_service", "onsite_chef"]));
    const hidden = addCatalogueFields(
      [{ id: "onsite_chef", type: "checkbox", label: "Chef", required: false, visible: false, order: 1 }] as any,
      "quick-card", menu as any, equipment as any, "ZAR",
    ).map((f) => f.id);
    expect(hidden).toContain("waiter_service");
    expect(hidden).not.toContain("onsite_chef");
  });

  it("asks how many children right after guests, and keeps kids meals out of the menu", () => {
    const fields = addCatalogueFields(
      [
        { id: "guest_count", type: "number", label: "Guests", required: true, visible: true, order: 5, mapsTo: "guest_count" },
        { id: "notes", type: "textarea", label: "Notes", required: false, visible: true, order: 99, mapsTo: "notes" },
      ] as any,
      "detailed-multi-step",
      [...menu, { id: "kid", item_name: "Kiddies Meals", base_price: 75, category: "Other" }] as any,
      equipment as any,
      "ZAR",
    );
    const ids = fields.map((f) => f.id);
    expect(ids.indexOf("children_count")).toBe(ids.indexOf("guest_count") + 1);
    const menuOptions = (fields.find((f) => f.id === "menu_item_ids")?.options || []) as any[];
    expect(menuOptions.some((o) => o.value === "kid")).toBe(false);
  });
});
