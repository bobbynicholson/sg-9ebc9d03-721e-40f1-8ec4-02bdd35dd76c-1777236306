/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/integrations/embed/new -- shortcut route that just opens the
 * gallery dialog on the main page. Lets us deep-link from anywhere
 * (notifications, marketing emails, dashboard prompts) without changing
 * the URL of the home page.
 */

import { useEffect } from "react";
import { useRouter } from "next/router";

export default function NewEmbedFormRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/integrations/embed?gallery=1");
  }, [router]);
  return null;
}
