/**
 * /client-portal/feedback - compatibility redirect.
 *
 * Review-request notifications used this route, but feedback now lives as
 * the inline rating strip on the client dashboard's past-events section.
 */
import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const url = ctx.req.url || "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  return {
    redirect: {
      destination: `/client-portal/dashboard${qs}#past-events`,
      permanent: false,
    },
  };
};

export default function ClientPortalFeedbackRedirect() {
  return null;
}
