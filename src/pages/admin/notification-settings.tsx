import type { GetServerSideProps } from "next";

/** Keep old bookmarks and cached navigation pointed at the shared page. */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: "/account/settings#notifications",
    permanent: false,
  },
});

export default function LegacyNotificationSettingsRedirect() {
  return null;
}
