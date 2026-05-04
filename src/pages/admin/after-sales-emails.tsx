/**
 * /admin/after-sales-emails -- retired in favour of the unified
 * messaging templates page. The post-event sequence (2/4/6/8/10/12
 * month touchpoints) now lives alongside lead and quote templates on
 * /admin/messaging-templates, so customisations go through a single
 * registry-backed editor.
 *
 * This page is kept as a redirect stub so existing bookmarks +
 * cron-generated links don't 404. Replace with a deletion once the
 * inbound links (AdminNav, settings.tsx, authGuards, aiOnboardingService)
 * have all been audited.
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

function AfterSalesEmailsRedirect() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace("/admin/messaging-templates"), 1500);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <>
      <NoIndexMeta />
      <Head><title>After-sales emails (moved) | Admin</title></Head>
      <AdminNav />
      <div className="min-h-screen bg-slate-50 lg:pl-72 xl:pl-80 flex items-center justify-center p-6">
        <Card className="border-0 shadow-lg max-w-md w-full">
          <CardContent className="py-8 px-6 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-100 flex items-center justify-center">
              <Mail className="w-6 h-6 text-emerald-600" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">After-sales emails moved</h1>
            <p className="text-sm text-slate-600">
              Post-event templates now live alongside lead and quote templates on a single page so company customisations stay in one place.
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

export default function ProtectedAfterSalesEmails() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <AfterSalesEmailsRedirect />
    </ProtectedRoute>
  );
}
