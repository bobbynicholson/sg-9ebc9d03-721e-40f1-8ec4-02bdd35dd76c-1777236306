/**
 * /admin/platform - index redirect.
 *
 * Middleware and legacy /super-admin redirects target this prefix. The
 * actual platform landing page is /admin/platform/dashboard.
 */
import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const url = ctx.req.url || "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  return {
    redirect: {
      destination: `/admin/platform/dashboard${qs}`,
      permanent: false,
    },
  };
};

export default function PlatformIndexRedirect() {
  return null;
}
