/**
 * /team-portal/driver/schedule - consolidation redirect.
 *
 * The standalone schedule page was absorbed into the calendar page
 * (2026-07-02 command-centre restructure): its day-bucketed
 * "Upcoming schedule" agenda now lives below the month grid on
 * /team-portal/driver/calendar, with the day bucketing rebuilt on
 * parseLocalDay/toLocalISO (the old page's UTC-midnight bucketing
 * shifted every job by a day for browsers west of UTC).
 *
 * Keep old bookmarks / notification links out of 404s by redirecting,
 * preserving the tenant slug + query string.
 */
import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const url = ctx.req.url || "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  const slug = typeof ctx.query.company_slug === "string" ? `/${ctx.query.company_slug}` : "";
  return {
    redirect: {
      destination: `${slug}/team-portal/driver/calendar${qs}`,
      permanent: false,
    },
  };
};

export default function DriverScheduleRedirect() {
  return null;
}
