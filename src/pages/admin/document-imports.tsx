import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { PortalShell, PortalHeader } from "@/components/portal/ui";
import { DocumentImportWorkbench } from "@/components/admin/DocumentImportWorkbench";
import { useTenantHref } from "@/lib/tenantUrl";
import { UserRole } from "@/types/app";
import { Button } from "@/components/ui/button";

export default function DocumentImportsPage() {
  const router = useRouter();
  const { withSlug } = useTenantHref();
  return <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
    <Head><title>Import quote and order PDFs - CateringMS</title><meta name="robots" content="noindex,nofollow" /></Head>
    <AdminNav />
    <div className="admin-page-shell"><PortalShell><PortalHeader title="Import quote and order PDFs" subtitle="Extract, match and review your documents before bringing them into the workflow." actions={<Button variant="outline" asChild><Link href={withSlug("/admin/onboarding/imports")}>Import history</Link></Button>} />
      {router.isReady && <DocumentImportWorkbench initialJob={typeof router.query.job === "string" ? router.query.job : undefined} initialDocument={typeof router.query.document === "string" ? router.query.document : undefined} initialTarget={router.query.target === "orders" ? "orders" : "quotes"} onJobChange={(job) => void router.replace({ pathname: router.pathname, query: { ...router.query, job } }, undefined, { shallow: true })} />}
    </PortalShell><Footer /></div>
  </ProtectedRoute>;
}
