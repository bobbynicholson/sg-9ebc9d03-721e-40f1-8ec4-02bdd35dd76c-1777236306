import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const slug = typeof ctx.query.company_slug === "string" ? `/${ctx.query.company_slug}` : "";
  return {
    redirect: {
      destination: `${slug}/team-portal/cleaning/dashboard#returns`,
      permanent: false,
    },
  };
};

export default function KitchenHandoversRedirect() {
  return null;
}
