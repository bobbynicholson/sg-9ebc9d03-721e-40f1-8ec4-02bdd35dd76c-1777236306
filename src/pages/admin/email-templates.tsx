/**
 * /admin/email-templates -- retired. Duplicate of after-sales-emails;
 * both fold into /admin/messaging-templates which is the single
 * registry-backed editor for every templated send (lead nudges, quote
 * follow-ups, post-event touchpoints, day-of-event broadcasts).
 *
 * Kept as a redirect stub so legacy nav links don't 404.
 */
import { useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, ArrowRight } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";

function EmailTemplatesRedirect() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace("/admin/messaging-templates"), 1500);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <>
      <NoIndexMeta />
      <Head><title>Email templates (moved) | Admin</title></Head>
      <AdminNav />
      <div className="min-h-screen bg-slate-50 lg:pl-72 xl:pl-80 flex items-center justify-center p-6">
        <Card className="border-0 shadow-lg max-w-md w-full">
          <CardContent className="py-8 px-6 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-100 flex items-center justify-center">
              <Mail className="w-6 h-6 text-emerald-600" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">Email templates moved</h1>
            <p className="text-sm text-slate-600">
              Email + WhatsApp templates now live on one page so customising one channel doesn't drift from the other.
            </p>
            <Link href="/admin/messaging-templates">
              <Button className="gap-2">
                Open Messaging templates <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <p className="text-[11px] text-slate-400">Redirecting automatically...</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function ProtectedEmailTemplates() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <EmailTemplatesRedirect />
    </ProtectedRoute>
  );
}
