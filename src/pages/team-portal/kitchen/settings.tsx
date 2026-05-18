/**
 * /team-portal/kitchen/settings - Wave 70.8
 *
 * Permanent redirect. The editable kitchen settings page moved to
 * /admin/kitchen-settings in Wave 70.8 because the BCEA shift
 * thresholds + prep policy knobs are management-level decisions,
 * not chef-tunable.
 *
 * Server-side redirect: kitchen-role users land back on /today
 * (their primary surface). Admins can be sent on to the new admin
 * page via the explicit nav link.
 *
 * Kept as a file (rather than deleted) so bookmarks + the previous
 * "Settings" nav link don't 404.
 */
import type { GetServerSideProps } from "next";
import { useTenantHref } from "@/lib/tenantUrl";
import { useEffect } from "react";
import { useRouter } from "next/router";

export const getServerSideProps: GetServerSideProps = async () => {
  // Best we can do server-side without knowing the slug: bounce
  // to a slug-aware client redirect. Returning props (not redirect)
  // lets the client-side useTenantHref resolve the right URL.
  return { props: {} };
};

export default function KitchenSettingsRedirect() {
  const router = useRouter();
  const { withSlug } = useTenantHref();

  useEffect(() => {
    router.replace(withSlug("/team-portal/kitchen/today"));
  }, [router, withSlug]);

  return (
    <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
      Redirecting...
    </div>
  );
}
