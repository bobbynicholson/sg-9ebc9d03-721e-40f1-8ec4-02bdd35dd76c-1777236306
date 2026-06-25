import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: "/team-portal/cleaning/dashboard#returns",
    permanent: false,
  },
});

export default function KitchenHandoversRedirect() {
  return null;
}
