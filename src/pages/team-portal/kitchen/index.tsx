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
  return {
    redirect: {
      destination: `/team-portal/kitchen/today${qs}`,
      permanent: false,
    },
  };
};

export default function KitchenIndexRedirect() {
  return null;
}
