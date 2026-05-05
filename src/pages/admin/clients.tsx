/**
 * /admin/clients -- DEPRECATED, redirects to /admin/contacts.
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
          <p className="text-sm text-slate-600 mt-2">Redirecting to Contacts...</p>
        </div>
      </div>
    </>
  );
}
