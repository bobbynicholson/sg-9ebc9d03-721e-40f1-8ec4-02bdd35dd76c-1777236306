import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {  UserRole  } from "@/types/app";

/**
 * Kitchen Duty Tracking Page (Admin View)
 * 
 * This page will display real-time kitchen duty status across all staff.
 * For now, it's a placeholder that redirects admins to the kitchen portal.
 */
export default function KitchenDutyTrackingPage() {
  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Kitchen Duty Tracking | CateringMS Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 flex items-center justify-center lg:pl-72 xl:pl-80">
        <div>Kitchen Duty Tracking Content</div>
      </div>
    </>
  );
}

export function ProtectedKitchenDutyTrackingPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <KitchenDutyTrackingPage />
    </ProtectedRoute>
  );
}