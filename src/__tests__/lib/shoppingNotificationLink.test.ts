import fs from "fs";
import path from "path";
import { shoppingNotificationLink } from "@/lib/shoppingNotificationLink";

const ORDER = "6f1c2d3e-0000-4000-8000-000000000001";

describe("shoppingNotificationLink", () => {
  it("sends shopping staff from office order links to the order's shopping view", () => {
    expect(shoppingNotificationLink(`/admin/orders?orderId=${ORDER}`, "shopping_staff"))
      .toBe(`/order/${ORDER}?role=shopping`);
    expect(shoppingNotificationLink(`/admin/orders?orderId=${ORDER}&tab=messages`, "shopping_staff"))
      .toBe(`/order/${ORDER}?role=shopping`);
  });

  it("sends low-stock office links to the shopping inventory page", () => {
    expect(shoppingNotificationLink("/admin/inventory", "shopping_staff")).toBe("/team-portal/shopping/inventory");
  });

  it("sends order shortfall alerts to the buy list", () => {
    expect(shoppingNotificationLink(`/team-portal/shopping/inventory?orderId=${ORDER}`, "shopping_staff"))
      .toBe("/team-portal/shopping/buy-list");
    // Item deep links are left alone.
    expect(shoppingNotificationLink("/team-portal/shopping/inventory?itemId=abc", "shopping_staff"))
      .toBe("/team-portal/shopping/inventory?itemId=abc");
  });

  it("leaves every other role and unknown links unchanged", () => {
    const link = `/admin/orders?orderId=${ORDER}`;
    for (const role of ["owner", "company_admin", "admin", "kitchen_staff", "driver", "cleaning_staff", undefined, null]) {
      expect(shoppingNotificationLink(link, role)).toBe(link);
    }
    expect(shoppingNotificationLink("/admin/orders", "shopping_staff")).toBe("/admin/orders");
    expect(shoppingNotificationLink("/team-portal/shopping/dashboard", "shopping_staff")).toBe("/team-portal/shopping/dashboard");
    expect(shoppingNotificationLink("https://example.com/x", "shopping_staff")).toBe("https://example.com/x");
  });
});

describe("cancellation stand-down alert", () => {
  it("reaches the shopping team like kitchen, drivers and cleaning", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/pages/api/orders/cancellation-review.ts"), "utf8");
    const call = source.slice(source.indexOf('title: "Order cancelled - stand down"'));
    const roles = call.slice(call.indexOf("targetRoles:"), call.indexOf("]", call.indexOf("targetRoles:")));
    for (const role of ["kitchen_staff", "shopping_staff", "driver", "cleaning_staff"]) {
      expect(roles).toContain(`"${role}"`);
    }
  });
});
