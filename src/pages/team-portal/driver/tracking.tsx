/**
 * /team-portal/driver/tracking - merged into /team-portal/driver/routes
 * (driver-portal command-centre restructure, 2026-07-02).
 *
 * The manifest accordion (food + equipment to load) and the "Mark as
 * arrived" action now live on the routes page's current-stop card
 * (anchor #current). This stub 302s old bookmarks and notification
 * links there, preserving the company slug and query string - same
 * recipe as /team-portal/driver/index.tsx.
 */
import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const url = ctx.req.url || "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  const slug = typeof ctx.query.company_slug === "string" ? `/${ctx.query.company_slug}` : "";
  return {
    redirect: {
      destination: `${slug}/team-portal/driver/routes${qs}#current`,
      permanent: false,
    },
  };
};

export default function DriverTrackingRedirect() {
  return null;
}
