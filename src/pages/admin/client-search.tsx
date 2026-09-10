import type { GetServerSideProps } from "next";

/**
 * /admin/client-search - folded into /admin/contacts.
 *
 * Client search was a strict data subset of Contacts: the same fuzzy
 * search over the same clients rows, minus the CRM layer (status,
 * suggestions, tags, saved views, CRUD, import/export). Its two unique
 * row actions (orders / invoices deep links per client) now live on
 * Contacts rows for registered clients, and its job maps onto the
 * "Clients" filter chip there. Old links land on the same view:
 * ?filter=clients preselects registered clients and every other query
 * param (company_slug, q, clientId) is preserved.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v == null) continue;
    params.set(key, v);
  }
  if (!params.has("filter")) params.set("filter", "clients");
  return {
    redirect: {
      destination: `/admin/contacts?${params.toString()}`,
      permanent: false,
    },
  };
};

export default function ClientSearchRedirect() {
  return null;
}
