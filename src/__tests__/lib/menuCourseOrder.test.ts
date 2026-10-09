import { groupByCourse } from "@/lib/menuCourses";
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
});
