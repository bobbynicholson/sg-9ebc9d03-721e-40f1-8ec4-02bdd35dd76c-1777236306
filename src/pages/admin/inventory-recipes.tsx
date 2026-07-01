import type { GetServerSideProps } from "next";

// Legacy page. It rendered the hardcoded RECIPE_MAPPINGS constant from
// inventoryDeductionService and told the operator to edit a .ts file to
// add a recipe. Phase 6 moved recipes to the recipes/recipe_ingredients
// tables, edited per menu item on /admin/menu, so this route now lands
// there (query string kept so ?company_slug survives the hop).
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const url = ctx.req.url || "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  return {
    redirect: {
      destination: `/admin/menu${qs}`,
      permanent: false,
    },
  };
};

export default function InventoryRecipesRedirect() {
  return null;
}
