/**
 * /admin/equipment-shortages -- standalone page wrapper.
 *
 * Renders the same ShortagesPanel that the Equipment hub mounts on
 * its "Shortages" tab. Kept as a discrete URL so existing bookmarks
 * and notification deep-links keep resolving.
 */
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ShortagesPanel } from "@/components/admin/equipment/ShortagesPanel";

function EquipmentShortagesPage() {
  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Equipment shortages | CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-screen-2xl">
          <div className="mb-6 md:mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1 md:mb-2">Equipment shortage flags</h1>
            <p className="text-sm md:text-base text-gray-600">Manage and resolve equipment shortage issues.</p>
          </div>

          <ShortagesPanel />
        </div>
        <Footer />
      </div>
    </>
  );
}

export default function ProtectedEquipmentShortagesPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <EquipmentShortagesPage />
    </ProtectedRoute>
  );
}
