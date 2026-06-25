import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const url = ctx.req.url || "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  return {
    redirect: {
      destination: `/admin/order-assignments${qs}`,
      permanent: false,
    },
  };
};

export default function DispatchQueueRedirect() {
  return null;
}
