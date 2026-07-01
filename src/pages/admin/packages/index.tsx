import { useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { UserRole } from "@/types/app";
import { useTenantHref } from "@/lib/tenantUrl";

function PackagesRedirectPage() {
  const router = useRouter();
  const { withSlug } = useTenantHref();

  useEffect(() => {
    if (!router.isReady) return;
    void router.replace(withSlug("/admin/orders"));
  }, [router, router.isReady, withSlug]);

  return (
    <>
      <Head><title>Orders - CateringMS</title></Head>
      <NoIndexMeta />
    </>
  );
}

export default function ProtectedPackagesRedirectPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <PackagesRedirectPage />
    </ProtectedRoute>
  );
}
