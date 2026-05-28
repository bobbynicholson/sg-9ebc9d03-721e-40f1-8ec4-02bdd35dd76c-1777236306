/**
 * /admin/messaging-templates - legacy alias for /admin/email-templates.
 *
 * Wave 50 LCF-Q (task #239, 2026-05-25): the registry-backed editor
 * is now the canonical surface at /admin/email-templates?tab=templates
 * (consolidated under "Messages & templates" in the sidebar). This
 * page used to be its own editor; keeping it as a redirect so older
 * notification deep-links + bookmarks keep working.
 */
import { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { NoIndexMeta } from "@/components/NoIndexMeta";

function MessagingTemplatesRedirect() {
  const router = useRouter();
  useEffect(() => {
    // Preserve company_slug + any tab query so /admin/messaging-templates
    // and /admin/messaging-templates?tab=templates both land cleanly.
    const { company_slug, tab, ...rest } = router.query;
    const next = {
      pathname: "/admin/email-templates",
      query: {
        ...(company_slug ? { company_slug } : {}),
        tab: typeof tab === "string" ? tab : "templates",
        ...rest,
      },
    };
    router.replace(next, undefined, { shallow: false });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
      Redirecting...
    </div>
  );
}

export default function ProtectedMessagingTemplatesRedirect() {
  return (
    <>
      <NoIndexMeta />
      <Head><title>Messaging templates - CateringMS</title></Head>
      <ProtectedRoute
        allowedRoles={[
          UserRole.SUPER_ADMIN,
          UserRole.COMPANY_ADMIN,
          UserRole.ADMIN,
          UserRole.OWNER,
        ]}
      >
        <MessagingTemplatesRedirect />
      </ProtectedRoute>
    </>
  );
}
