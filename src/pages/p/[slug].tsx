/**
 * /p/[slug] - short tenant-portal redirect.
 *
 * Bounces to /[slug]/client/login. The whole point is keeping the URL
 * short so it fits cleanly in WhatsApp / SMS / email signatures
 * without dominating the message. `cateringms.com/p/spit-braai-
 * delivery` reads better than the full /spit-braai-delivery/client/
 * login path.
 *
 * Public route - no auth required, no tenant data exposed. The
 * destination is the magic-link login page itself, which already
 * handles unauthenticated visitors.
 */
import { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const slug = String(ctx.params?.slug || "").trim();
  if (!slug) {
    return { redirect: { destination: "/", permanent: false } };
  }
  return {
    redirect: {
      destination: `/${slug}/client/login`,
      permanent: false,
    },
  };
};

export default function PortalShortRedirect() {
  // Never renders - getServerSideProps always redirects. Component
  // body required so Next doesn't complain about a missing default.
  return null;
}
