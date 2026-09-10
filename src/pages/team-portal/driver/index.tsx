/**
 * /team-portal/driver - index redirect.
 *
 * Keep bare role links from older notifications/bookmarks out of 404s.
 */
import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const url = ctx.req.url || "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  const slug = typeof ctx.query.company_slug === "string" ? `/${ctx.query.company_slug}` : "";
  return {
    redirect: {
      destination: `${slug}/team-portal/driver/dashboard${qs}`,
      permanent: false,
    },
  };
};

export default function DriverIndexRedirect() {
  return null;
}
