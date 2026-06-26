/**
 * /admin/clients - DEPRECATED, redirects to /admin/contacts.
 *
 * The Contacts page is now the single source of truth for the client
 * contact database. Bobby pulled the separate "Clients" page so the
 * sidebar and lifecycle don't fork down two surfaces.
 *
 * Page kept as a redirect (rather than a hard delete) so any bookmark,
 * historical email link or internal reference still lands somewhere
 * useful instead of a 404. Forwards any querystring (e.g.
 * ?clientId=xxx) onto Contacts so deep-link patterns continue to work.
 */
import { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Loader2 } from "lucide-react";
import { PageWorkbench } from "@/components/portal/ui";

export default function ClientsRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    // Strip the leading "/admin/clients" prefix from asPath so we keep
    // any querystring and any tenant-slug prefix the middleware added.
    const asPath = router.asPath || "/admin/clients";
    const target = asPath.replace(/\/admin\/clients(\b|$)/, "/admin/contacts$1");
    router.replace(target);
  }, [router]);

  return (
    <>
      <Head><title>Redirecting to Contacts...</title></Head>
      <div className="admin-page-shell admin-page-shell--no-sidebar admin-page-shell--center p-4">
        <div className="w-full max-w-xl">
          <PageWorkbench />
          <div className="rounded-2xl border border-slate-300/80 bg-white/90 p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-primary" />
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Redirecting to Contacts...</p>
          </div>
        </div>
      </div>
    </>
  );
}
