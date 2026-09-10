import type { GetServerSideProps } from "next";

/**
 * /admin/inventory-tracking - retired into /admin/inventory.
 *
 * This page was a legacy fork of the inventory workspace that drifted
 * badly (no route guard, hard deletes, unsigned movement rows, showed
 * soft-deleted items). The canonical surface at /admin/inventory now
 * covers everything it did: full CRUD, receive/count/write-off flows,
 * per-item movement history, and ?id= deep-link expansion. Old
 * bookmarks and the command palette's ?itemId= links land on the same
 * item via the translation below; all other query params (company_slug
 * etc.) are preserved.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v == null) continue;
    params.set(key === "itemId" ? "id" : key, v);
  }
  const qs = params.toString();
  return {
    redirect: {
      destination: `/admin/inventory${qs ? `?${qs}` : ""}`,
      permanent: false,
    },
  };
};

export default function InventoryTrackingRedirect() {
  return null;
}
