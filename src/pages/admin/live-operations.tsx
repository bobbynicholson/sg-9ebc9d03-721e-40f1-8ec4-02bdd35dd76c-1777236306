import type { GetServerSideProps } from "next";
import { tenantRedirectPrefix } from "@/lib/tenantRedirect";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const url = ctx.req.url || "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  return {
    redirect: {
      destination: `${tenantRedirectPrefix(ctx)}/admin/tracking${qs}`,
      permanent: false,
    },
  };
};

export default function LiveOperationsRedirect() {
  return null;
}
