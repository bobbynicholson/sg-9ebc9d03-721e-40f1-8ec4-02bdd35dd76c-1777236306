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
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#eef2f6_0%,#f8fafc_260px,#f8fafc_100%)] p-4 text-slate-500 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_260px,#0f172a_100%)]">
      <div className="w-full max-w-xl rounded-lg border border-slate-300/80 bg-white/90 p-8 text-center text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
        Redirecting to Kitchen today...
      </div>
    </div>
  );
}
