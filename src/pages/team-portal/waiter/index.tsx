import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const url = ctx.req.url || "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  const slug = typeof ctx.query.company_slug === "string" ? `/${ctx.query.company_slug}` : "";
  return {
    redirect: {
      destination: `${slug}/team-portal/waiter/dashboard${qs}`,
      permanent: false,
    },
  };
};

export default function WaiterIndexRedirect() {
  return null;
}
