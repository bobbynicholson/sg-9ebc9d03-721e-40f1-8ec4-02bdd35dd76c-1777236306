import { orderPlaceSettingItems, restorePackageItemOrder } from "@/lib/placeSettings";

describe("existing lead and draft quote equipment", () => {
  it.each(["name", "item_name"] as const)("orders saved %s rows without changing quantities, prices or unrelated equipment", (nameKey) => {
    const names = ["Stainless Steel Fork", "Salad Bowl (medium)", "Bowl (Porcelain)", "Plate 20cm", "Chafing dish", "Stainless Steel Knife", "Stainless Steel Spoon"];
    const rows: { name?: string; item_name?: string; equipment_id: string; quantity: number; unit_price: number }[] = names
      .map((name, index) => ({ [nameKey]: name, equipment_id: `id-${index}`, quantity: index + 20, unit_price: index + 2 }));
    const before = JSON.parse(JSON.stringify(rows));
    const ordered = orderPlaceSettingItems(rows);
    expect(ordered.map((row) => row[nameKey])).toEqual([
      "Plate 20cm", "Salad Bowl (medium)", "Stainless Steel Knife", "Stainless Steel Fork", "Chafing dish", "Bowl (Porcelain)", "Stainless Steel Spoon",
    ]);
    expect(rows).toEqual(before);
    expect(ordered).toEqual([rows[3], rows[1], rows[5], rows[0], rows[4], rows[2], rows[6]]);
    expect(orderPlaceSettingItems(ordered)).toEqual(ordered);
  });

  it("preserves custom package order, unrelated items and missing catalogue rows", () => {
    const rows = [{ id: "fork" }, { id: "chafing" }, { id: "knife" }];
    expect(restorePackageItemOrder(rows, new Set(["deleted", "knife", "fork"])))
      .toEqual([rows[2], rows[1], rows[0]]);
    expect(restorePackageItemOrder(rows, new Set())).toEqual(rows);
    expect(orderPlaceSettingItems([])).toEqual([]);
  });
});
