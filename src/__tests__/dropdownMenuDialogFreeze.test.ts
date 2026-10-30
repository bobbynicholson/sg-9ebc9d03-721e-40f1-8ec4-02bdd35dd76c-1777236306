// Row "More actions" menus that open dialogs must be non-modal. A modal
// menu plus a modal dialog left the page's pointer-events lock behind
// once the dialog closed and the list reloaded (contacts froze until a
// page reload). See src/pages/admin/contacts.tsx.
import * as fs from "fs";
import * as path from "path";

const MENUS_THAT_OPEN_DIALOGS: Array<[string, number]> = [
  ["src/pages/admin/contacts.tsx", 1],
  ["src/components/admin/orders/OrderDetailsModal.tsx", 1],
  ["src/pages/admin/driver-management.tsx", 1],
  ["src/pages/admin/integrations/embed.tsx", 1],
  ["src/pages/admin/inventory.tsx", 2],
  ["src/pages/admin/order-assignments.tsx", 1],
];

describe("shared dropdown menu", () => {
  it("is non-modal unless a menu opts in", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/ui/dropdown-menu.tsx"), "utf8");
    expect(source).toMatch(/modal = false/);
    expect(source).toMatch(/<DropdownMenuPrimitive\.Root modal=\{modal\}/);
  });
});

describe("menus that open dialogs", () => {
  it.each(MENUS_THAT_OPEN_DIALOGS)("%s uses non-modal menus", (file, count) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source.match(/<DropdownMenu modal=\{false\}>/g)?.length ?? 0).toBeGreaterThanOrEqual(count);
  });
});
