/**
 * /team-portal/kitchen - index redirect.
 *
 * The kitchen user's primary surface is Today. The old dashboard route
 * remains as an alias, but bare role links should land on the new name.
 */
import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const url = ctx.req.url || "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  const slug = typeof ctx.query.company_slug === "string" ? `/${ctx.query.company_slug}` : "";
  return {
    redirect: {
      destination: `${slug}/team-portal/kitchen/today${qs}`,
      permanent: false,
    },
  };
};

export default function KitchenIndexRedirect() {
  return null;
}
