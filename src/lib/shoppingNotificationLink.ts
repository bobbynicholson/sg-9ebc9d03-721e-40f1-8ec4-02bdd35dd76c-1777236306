/**
 * Where a notification's "Open" should take a shopping staff member.
 *
 * Several team broadcasts (order amended, order cancelled, client chat,
 * low stock) store an office link such as /admin/orders?orderId=... or
 * /admin/inventory. Shopping staff can't open /admin pages, so the
 * middleware bounced them away and "Open" looked broken. The kitchen,
 * driver and cleaning teams get order links into /order/{id}; this maps
 * shopping to the same places:
 *
 *   /admin/orders?orderId=X              -> /order/X?role=shopping
 *   /admin/inventory...                  -> /team-portal/shopping/inventory
 *   /team-portal/shopping/inventory?orderId=X -> /team-portal/shopping/buy-list
 *     (the inventory page ignores orderId; the buy list is where a
 *     shortfall for an order is actually bought)
 *
 * Mapping at open time (not in the producers) also fixes the alerts that
 * are already in people's inboxes. Every other role, and any link not
 * listed above, is returned unchanged.
 */
export function shoppingNotificationLink(
  link: string,
  role: string | null | undefined,
): string {
  if (role !== "shopping_staff" || !link || /^https?:\/\//i.test(link)) return link;

  const [path, query = ""] = link.split("?");
  const params = new URLSearchParams(query);

  if (path === "/admin/orders") {
    const orderId = params.get("orderId");
    if (orderId) return `/order/${encodeURIComponent(orderId)}?role=shopping`;
  }
  if (path === "/admin/inventory" || path.startsWith("/admin/inventory/")) {
    return "/team-portal/shopping/inventory";
  }
  if (path === "/team-portal/shopping/inventory" && params.has("orderId")) {
    return "/team-portal/shopping/buy-list";
  }
  return link;
}
