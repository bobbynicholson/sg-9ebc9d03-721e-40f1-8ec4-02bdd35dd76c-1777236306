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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, FileText, Mail, RefreshCw, Send } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench, StatTile,
} from "@/components/portal/ui";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { TemplatesPanel } from "@/components/admin/lifecycle-emails/TemplatesPanel";
import { SentLogPanel } from "@/components/admin/lifecycle-emails/SentLogPanel";
import { AutomationDashboardPanel } from "@/components/admin/lifecycle-emails/AutomationDashboardPanel";
import { AutomationSettingsPanel } from "@/components/admin/lifecycle-emails/AutomationSettingsPanel";

const TABS = ["templates", "sent-log", "automation", "settings"] as const;
type TabKey = typeof TABS[number];

interface LifecycleStats {
  /** Tenant-customised templates saved (email + WhatsApp overrides). */
  customTemplates: number;
  /** Emails sent from the queue in the last 30 days. */
  sent30: number;
  /** Failed / errored queue rows in the last 30 days. */
  failed30: number;
  /** Quote follow-ups logged in the last 30 days. */
  followups30: number;
}

/** Head-only counts for the hero chips + stat band. Cheap: five
 *  count queries, no row payloads. Kept at page level so the tab
 *  panels stay untouched (they load their own detail data). */
async function loadLifecycleStats(companyId: string): Promise<LifecycleStats> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const countOf = (p: PromiseLike<{ count: number | null; error: any }>) =>
    Promise.resolve(p).then((r) => {
      if (r.error) throw r.error;
      return r.count ?? 0;
    });
  const [emailTpl, waTpl, sent30, failed30, followups30] = await Promise.all([
    countOf((supabase as any)
      .from("email_templates")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)),
    countOf((supabase as any)
      .from("whatsapp_templates")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)),
    countOf((supabase as any)
      .from("outgoing_email_queue")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "sent")
      .gte("created_at", since)),
    countOf((supabase as any)
      .from("outgoing_email_queue")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      // "failed" is the only failure value in the status CHECK - there
      // is no "error" status on outgoing_email_queue.
      .eq("status", "failed")
      .gte("created_at", since)),
    countOf((supabase as any)
      .from("quote_followup_log")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("sent_at", since)),
  ]);
  return { customTemplates: emailTpl + waTpl, sent30, failed30, followups30 };
}

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
  const { user, profile } = useAuth() as {
    user: { company_id?: string } | null;
    profile: { company_id?: string } | null;
  };
  const companyId = profile?.company_id || user?.company_id || null;

  const [stats, setStats] = useState<LifecycleStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    if (!companyId) {
      setStatsLoading(false);
      return;
    }
    setStatsLoading(true);
    setStatsError(null);
    try {
      setStats(await loadLifecycleStats(companyId));
    } catch (e: any) {
      // Never render zeros that look healthy when the counts failed.
      setStats(null);
      setStatsError(e?.message || "The email activity counts could not be loaded.");
    } finally {
      setStatsLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void refreshStats(); }, [refreshStats]);

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

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          {/* Command-centre hero: brand band with LIVE meta chips from
              head-only count queries (customised templates, 30-day send
              volume, 30-day failures). */}
          <PortalHeader
            variant="hero"
            title="Lifecycle emails"
            icon={Mail}
            subtitle="Templates, sent log, and automation. All your post-sale email touchpoints in one place."
            meta={
              stats ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {stats.customTemplates} customised template{stats.customTemplates === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {stats.sent30} sent (30d)
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className={`h-1.5 w-1.5 rounded-full ${stats.failed30 > 0 ? "bg-rose-400" : "bg-emerald-400"}`} />
                    {stats.failed30} failed (30d)
                  </span>
                </>
              ) : undefined
            }
          />
          <PageWorkbench />

          {statsError && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
              <p className="flex-1 text-sm text-rose-900">
                Couldn&apos;t load the email activity counts: {statsError}
              </p>
              <Button variant="outline" size="sm" onClick={() => void refreshStats()} disabled={statsLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${statsLoading ? "animate-spin" : ""}`} /> Retry
              </Button>
            </div>
          )}

          {/* Stat band: same live counts as the chips plus follow-up
              volume, so the hub opens with real backend data before a
              tab is picked. Skeleton keeps the shell in place. */}
          {!statsError && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {statsLoading || !stats ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-28 animate-pulse rounded-xl border border-slate-200/90 bg-slate-100/80 dark:border-slate-800 dark:bg-slate-800/50"
                  />
                ))
              ) : (
                <>
                  <StatTile
                    label="Customised templates"
                    icon={FileText}
                    value={stats.customTemplates}
                    hint="Email and WhatsApp wording you have overridden"
                  />
                  <StatTile
                    label="Emails sent"
                    icon={Send}
                    value={stats.sent30}
                    hint="Delivered from the queue, last 30 days"
                  />
                  <StatTile
                    label="Send failures"
                    icon={AlertTriangle}
                    value={stats.failed30}
                    hint={stats.failed30 > 0 ? "Check the Sent Log tab for the errors" : "No failures in the last 30 days"}
                  />
                  <StatTile
                    label="Quote follow-ups"
                    icon={CheckCircle2}
                    value={stats.followups30}
                    hint="Automated follow-ups logged, last 30 days"
                  />
                </>
              )}
            </div>
          )}

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
        </PortalShell>

        <Footer />
      </div>
    </>
  );
}
