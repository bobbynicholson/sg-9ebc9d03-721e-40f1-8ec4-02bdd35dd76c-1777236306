/**
 * /admin/email-templates - Lifecycle Emails hub.
 *
 * Four tabs collapse what used to be four separate routes:
 *   Templates    - the messaging templates editor (was /admin/messaging-templates surface)
 *   Sent Log     - after-sales sends overview (was /admin/after-sales-emails)
 *   Automation   - read-only follow-up audit (was /admin/email-automation-dashboard)
 *   Settings     - SMTP + automation rules editor (was /admin/email-automation-settings)
 *
 * Tab state is mirrored to ?tab=... so deep-links land on the right
 * surface. Default tab is "templates" (the most-used surface).
 *
 * The four standalone routes still exist as slim wrappers around the
 * same Panel components so legacy bookmarks and notification deep-links
 * keep resolving.
 */
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { TemplatesPanel } from "@/components/admin/lifecycle-emails/TemplatesPanel";
import { SentLogPanel } from "@/components/admin/lifecycle-emails/SentLogPanel";
import { AutomationDashboardPanel } from "@/components/admin/lifecycle-emails/AutomationDashboardPanel";
import { AutomationSettingsPanel } from "@/components/admin/lifecycle-emails/AutomationSettingsPanel";

const TABS = ["templates", "sent-log", "automation", "settings"] as const;
type TabKey = typeof TABS[number];

export default function ProtectedLifecycleEmailsPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.SUPER_ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.ADMIN,
        UserRole.OWNER,
      ]}
    >
      <LifecycleEmailsPage />
    </ProtectedRoute>
  );
}

function LifecycleEmailsPage() {
  const router = useRouter();

  const initialTab = useMemo<TabKey>(() => {
    const t = (router.query.tab as string | undefined) || "";
    return (TABS as readonly string[]).includes(t) ? (t as TabKey) : "templates";
  }, [router.query.tab]);
  const [tab, setTab] = useState<TabKey>(initialTab);
  useEffect(() => { setTab(initialTab); }, [initialTab]);

  const handleTabChange = (next: string) => {
    const t = (TABS as readonly string[]).includes(next) ? (next as TabKey) : "templates";
    setTab(t);
    const query = { ...router.query, tab: t };
    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Lifecycle emails - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-6xl mx-auto">
          <div className="mb-6 flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg">
              <Mail className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">
                Lifecycle Emails
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Templates, sent log, and automation. All your post-sale email touchpoints in one place.
              </p>
            </div>
          </div>

          <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full md:w-auto h-auto">
              <TabsTrigger value="templates"  className="text-xs md:text-sm">Templates</TabsTrigger>
              <TabsTrigger value="sent-log"   className="text-xs md:text-sm">Sent Log</TabsTrigger>
              <TabsTrigger value="automation" className="text-xs md:text-sm">Automation</TabsTrigger>
              <TabsTrigger value="settings"   className="text-xs md:text-sm">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="templates" className="mt-6">
              <TemplatesPanel />
            </TabsContent>

            <TabsContent value="sent-log" className="mt-6">
              <SentLogPanel />
            </TabsContent>

            <TabsContent value="automation" className="mt-6">
              <AutomationDashboardPanel />
            </TabsContent>

            <TabsContent value="settings" className="mt-6">
              <AutomationSettingsPanel />
            </TabsContent>
          </Tabs>
        </div>

        <Footer />
      </div>
    </>
  );
}
