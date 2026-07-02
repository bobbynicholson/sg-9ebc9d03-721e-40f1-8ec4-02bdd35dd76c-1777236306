/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/integrations/embed/new - shortcut route that just opens the
 * gallery dialog on the main page. Lets us deep-link from anywhere
 * (notifications, marketing emails, dashboard prompts) without changing
 * the URL of the home page.
 */

import { useEffect } from "react";
import { useRouter } from "next/router";
import { useTenantHref } from "@/lib/tenantUrl";

export default function NewEmbedFormRedirect() {
  const router = useRouter();
  // The bare path dropped the tenant slug prefix, bouncing deep-linked
  // users through the slugless URL. Wait for the router so the
  // company_slug query is hydrated before resolving.
  const { withSlug } = useTenantHref();
  useEffect(() => {
    if (!router.isReady) return;
    router.replace(withSlug("/admin/integrations/embed?gallery=1"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);
  return null;
}
