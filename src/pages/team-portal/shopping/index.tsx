/**
 * /team-portal/shopping - index redirect.
 *
 * Shopping's real landing page is the Today dashboard. This keeps bare
 * shopping links from older cross-role surfaces resolving correctly.
 */
import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const url = ctx.req.url || "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  return {
    redirect: {
      destination: `/team-portal/shopping/dashboard${qs}`,
      permanent: false,
    },
  };
};

export default function ShoppingIndexRedirect() {
  return null;
}
