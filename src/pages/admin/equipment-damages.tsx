import type { GetServerSideProps } from "next";

// Legacy alias. The damage register lives as the Damages tab on
// /admin/equipment (CatalogueOperationsStrip already deep-links there),
// so this standalone copy of the same DamageAnalytics surface now
// redirects instead of duplicating it. Existing query params (e.g.
// ?company_slug) are kept and tab=damages is forced.
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const url = ctx.req.url || "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  const params = new URLSearchParams(qs);
  params.set("tab", "damages");
  return {
    redirect: {
      destination: `/admin/equipment?${params.toString()}`,
      permanent: false,
    },
  };
};

export default function EquipmentDamagesRedirect() {
  return null;
}
