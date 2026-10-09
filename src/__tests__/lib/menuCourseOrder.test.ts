import { fetchMenuCategories, groupByCourse, sortByCourse } from "@/lib/menuCourses";
import { MENU_CATEGORIES } from "@/services/menuService";

describe("menu course ordering", () => {
  it("keeps the menu category list in the same canonical flow across the app", () => {
    expect(MENU_CATEGORIES).toEqual([
      "Starters",
      "Mains",
      "Sides",
      "Salads",
      "Desserts",
      "Drinks",
      "Equipment",
      "Kids",
      "Service",
      "Other",
    ]);
  });

  it("groups menu lines by the canonical course order, no matter how the raw array was entered", () => {
    const items = [
      { name: "Crispy Chicken", category: "Other" },
      { name: "Garden Salad", category: "Salads" },
      { name: "Pap & Chops", category: "Mains" },
      { name: "Garlic Bread", category: "Starters" },
      { name: "Roasted Veg", category: "Sides" },
    ];

    expect(groupByCourse(items, (item) => item.category).map((group) => group.heading)).toEqual([
      "Starters",
      "Mains",
      "Sides",
      "Salads",
      "Other",
    ]);
  });

  it("keeps a swapped-in main in the mains block, and looks categories up by menu item id", async () => {
    const lines = [
      { name: "Garlic Bread", category: "starter" },
      { name: "Salad", category: "salad" },
      { name: "Chicken", category: "main" },
    ];
    expect(sortByCourse(lines, (l) => l.category).map((l) => l.name)).toEqual(["Garlic Bread", "Chicken", "Salad"]);

    const sb = { from: () => ({ select: () => ({ in: async () => ({ data: [{ id: "m1", category: "Mains" }] }) }) }) };
    const map = await fetchMenuCategories(sb, ["m1", null, "m1"]);
    expect(map.get("m1")).toBe("Mains");
  });
});
