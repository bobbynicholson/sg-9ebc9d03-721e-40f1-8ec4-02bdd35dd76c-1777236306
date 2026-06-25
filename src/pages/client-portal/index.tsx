/**
 * /client-portal - index redirect.
 *
 * A few payment and notification flows historically linked to the bare
 * client portal path. The real landing page is the dashboard, so preserve
 * query params and make those older links land somewhere useful.
 */
import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const url = ctx.req.url || "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  return {
    redirect: {
      destination: `/client-portal/dashboard${qs}`,
      permanent: false,
    },
  };
};

export default function ClientPortalIndexRedirect() {
  return null;
}
