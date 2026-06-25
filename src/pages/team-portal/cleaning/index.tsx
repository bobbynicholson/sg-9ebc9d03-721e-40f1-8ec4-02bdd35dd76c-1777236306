/**
 * /team-portal/cleaning - index redirect.
 *
 * The cleaning portal's real landing page is /team-portal/cleaning/dashboard,
 * but notifications across the app (damage flags, new cleaning jobs, handover
 * generation, collection handover, the overdue-check cron) have always linked
 * to the bare /team-portal/cleaning path - which had no page and 404'd. This
 * redirect makes every one of those links resolve to the dashboard, carrying
 * the query string forward so the company_slug (and any deep-link params)
 * survive the hop.
 */
import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const url = ctx.req.url || "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  const slug = typeof ctx.query.company_slug === "string" ? `/${ctx.query.company_slug}` : "";
  return {
    redirect: {
      destination: `${slug}/team-portal/cleaning/dashboard${qs}`,
      permanent: false,
    },
  };
};

export default function CleaningIndexRedirect() {
  return null;
}
