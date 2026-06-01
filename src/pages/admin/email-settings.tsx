/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Email + Integrations settings. Catering company picks one of:
 *  - Gmail OAuth   (cleanest - sends through their actual Gmail)
 *  - Microsoft 365 OAuth
 *  - Custom SMTP   (host:port + user/pass)
 *  - Default (no provider configured - compose links only)
 *
 * Mailchimp lives here too for bulk-sending integration.
 *
 * Direct send via the company's own provider runs through a Supabase
 * edge function (planned). For now this page persists the config and
 * shows quota / connection state. The Clients CRM continues to use
 * compose links until the edge function lands.
 *
 * Silicon Valley UX: live cap progress bar with optimistic save +
 * "Test connection" button that flashes a checkmark + a copy-to-clipboard
 * receipt of the last test ID.
 */
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Mail, Shield, Server, CheckCircle2, AlertTriangle, Send, Loader2, ExternalLink, Inbox, BarChart3, Sparkles, Globe, ShieldCheck } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useToast } from "@/hooks/use-toast";
import { ResendDomainCard } from "@/components/admin/ResendDomainCard";
import { toLocalISO } from "@/lib/localDate";
import { captureException } from "@/lib/observability";

type Provider = "none" | "resend" | "gmail_oauth" | "ms365_oauth" | "smtp";

interface ProviderRow {
  id?: string;
  company_id?: string;
  provider: Provider;
  from_email: string | null;
  from_name: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_secure: boolean;
  oauth_account_email: string | null;
  daily_send_cap: number;
  is_verified: boolean;
  last_test_sent_at: string | null;
  last_test_error: string | null;
  // auto-attach toggles
  auto_attach_on_quote_sent: boolean;
  auto_attach_on_order_confirmed: boolean;
  auto_attach_on_order_status_change: boolean;
  magic_link_repeat_customers: boolean;
  magic_link_repeat_threshold: number;
  revoke_old_links_on_new: boolean;
}

// Daily send caps per subscription plan. Numbers chosen to align with
// Resend's free-tier ceiling (100/day per verified domain) and scale up
// from there. Pro / scale tiers run on Resend's paid plan so the daily
// limit goes well above the free-tier cap. Super_admin can override
// per-row through direct DB edit for one-off cases.
const PRICING_TIER_CAPS: Record<string, number> = {
  trial:   100,
  starter: 200,
  growth:  500,
  pro:     1500,
  scale:   5000,
};

function EmailSettingsPage() {
  const { profile, user } = useAuth() as any;
  const companyId = profile?.company_id || user?.company_id;
  const subscriptionPlan = (profile?.subscription_plan || "trial") as string;
  const tierCap = PRICING_TIER_CAPS[subscriptionPlan] ?? 30;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  // Dirty-state tracking so the test-email button can tell the user
  // "save first" instead of letting them test against stale DB rows
  // and getting a confusing failure. Set after every successful save
  // (and after the initial load) so editing then immediately testing
  // surfaces the right blocker.
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [row, setRow] = useState<ProviderRow>({
    provider: "resend",
    from_email: null,
    from_name: null,
    smtp_host: null,
    smtp_port: 587,
    smtp_user: null,
    smtp_secure: true,
    oauth_account_email: null,
    daily_send_cap: tierCap,
    is_verified: false,
    last_test_sent_at: null,
    last_test_error: null,
    auto_attach_on_quote_sent: true,
    auto_attach_on_order_confirmed: true,
    auto_attach_on_order_status_change: false,
    magic_link_repeat_customers: true,
    magic_link_repeat_threshold: 2,
    revoke_old_links_on_new: false,
  });
  const [queuedCount, setQueuedCount] = useState(0);
  const [smtpPass, setSmtpPass] = useState("");
  const [mailchimpApiKey, setMailchimpApiKey] = useState("");
  const [mailchimpAudienceId, setMailchimpAudienceId] = useState("");
  // ES-B (task #221, 2026-05-25): custom recipient for the test
  // send. Pre-ES-B the test always landed in row.from_email so an
  // operator wanting to see what an actual client sees had to
  // change the from address. Now they can punch in any inbox.
  const [testRecipient, setTestRecipient] = useState("");
  // ES-B: rolling 7-day send count per local day. Drives the
  // sparkline in the Today's send count tile so the operator
  // can spot a usage trend at a glance.
  const [last7Counts, setLast7Counts] = useState<Array<{ day: string; count: number }>>([]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const todayISO = toLocalISO(new Date());
      const [{ data }, { count }, { count: queued }] = await Promise.all([
        supabase
          .from("email_provider_settings")
          .select("*")
          .eq("company_id", companyId)
          .neq("provider", "mailchimp")
          .order("updated_at", { ascending: false })
          .maybeSingle(),
        supabase
          .from("outgoing_email_log")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .gte("sent_at", `${todayISO}T00:00:00`),
        supabase
          .from("outgoing_email_queue")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "queued"),
      ]);
      if (cancelled) return;
      setTodayCount(count ?? 0);
      setQueuedCount(queued ?? 0);
      if (data) {
        const loaded = {
          ...data,
          daily_send_cap: data.daily_send_cap ?? tierCap,
        } as ProviderRow;
        setRow(loaded);
        setSavedSnapshot(JSON.stringify(loaded));
      } else {
        // Seed defaults from profile
        setRow((r) => {
          const next = {
            ...r,
            from_email: profile?.email || null,
            from_name: profile?.full_name || profile?.company_name || null,
            daily_send_cap: tierCap,
          };
          // No DB row yet, so the seeded defaults count as 'dirty'
          // until the user saves. Set the snapshot to an empty marker
          // so hasUnsavedChanges resolves true.
          setSavedSnapshot("");
          return next;
        });
      }

      // Mailchimp row
      const { data: mc, error: mcError } = await supabase
        .from("email_provider_settings")
        .select("mailchimp_audience_id")
        .eq("company_id", companyId)
        .eq("provider", "mailchimp")
        .maybeSingle();
      if (mcError) {
        captureException(mcError, {
          tags: { route: "/admin/email-settings", step: "load-mailchimp", companyId },
        });
      }
      if (mc) setMailchimpAudienceId(mc.mailchimp_audience_id || "");

      // ES-B (task #221, 2026-05-25): pull the last 7 days of
      // outgoing_email_log rows so the sparkline has a real series
      // to render. Cheap: only id + sent_at, 7 days max per tenant
      // bounded by the daily cap.
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      const { data: logRows, error: logErr } = await supabase
        .from("outgoing_email_log")
        .select("sent_at")
        .eq("company_id", companyId)
        .gte("sent_at", sevenDaysAgo.toISOString())
        .limit(10_000);
      if (logErr) {
        captureException(logErr, {
          tags: { route: "/admin/email-settings", step: "load-7d-sends", companyId },
        });
      } else if (logRows) {
        const buckets = new Map<string, number>();
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          buckets.set(toLocalISO(d), 0);
        }
        for (const r of logRows as Array<{ sent_at: string | null }>) {
          if (!r.sent_at) continue;
          const day = toLocalISO(new Date(r.sent_at));
          if (buckets.has(day)) buckets.set(day, (buckets.get(day) || 0) + 1);
        }
        setLast7Counts(Array.from(buckets.entries()).map(([day, count]) => ({ day, count })));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, tierCap]);

  // Returns true on success, false on failure. The caller can use the
  // return value to decide whether to chain follow-up work (e.g. the
  // Send test email button calls save() first when the form is dirty,
  // and aborts the test if the save failed).
  const save = async (): Promise<boolean> => {
    if (!companyId) return false;
    setSaving(true);
    try {
      // Only invalidate domain verification when a save actually changes
      // a verification-relevant field. Editing daily_send_cap or
      // auto_attach toggles used to silently flip is_verified back to
      // false, which dropped the operator back into "verify your domain
      // again" without any indication why [P1-04].
      const { data: existing } = await supabase
        .from("email_provider_settings")
        .select("provider, from_email, from_name, smtp_host, smtp_port, smtp_user, is_verified")
        .eq("company_id", companyId)
        .eq("provider", row.provider)
        .maybeSingle();

      const verificationRelevantChanged = !existing
        ? true
        : (existing as any).provider !== row.provider
          || (existing as any).from_email !== row.from_email
          || (existing as any).from_name !== row.from_name
          || (row.provider === "smtp" && (
                (existing as any).smtp_host !== row.smtp_host
             || (existing as any).smtp_port !== row.smtp_port
             || (existing as any).smtp_user !== row.smtp_user
             || !!smtpPass /* new password = re-verify */
          ));

      const payload = {
        company_id: companyId,
        provider: row.provider,
        from_email: row.from_email,
        from_name: row.from_name,
        smtp_host: row.provider === "smtp" ? row.smtp_host : null,
        smtp_port: row.provider === "smtp" ? row.smtp_port : null,
        smtp_user: row.provider === "smtp" ? row.smtp_user : null,
        smtp_pass_encrypted: row.provider === "smtp" && smtpPass ? smtpPass : undefined,
        smtp_secure: row.smtp_secure,
        daily_send_cap: row.daily_send_cap,
        // Preserve existing verification when the save only touches
        // non-credential fields. Reset to false only when something that
        // actually invalidates verification changed.
        is_verified: verificationRelevantChanged ? false : (existing as any)?.is_verified ?? false,
        auto_attach_on_quote_sent:          row.auto_attach_on_quote_sent,
        auto_attach_on_order_confirmed:     row.auto_attach_on_order_confirmed,
        auto_attach_on_order_status_change: row.auto_attach_on_order_status_change,
        magic_link_repeat_customers:        row.magic_link_repeat_customers,
        magic_link_repeat_threshold:        row.magic_link_repeat_threshold,
        revoke_old_links_on_new:            row.revoke_old_links_on_new,
        updated_at: new Date().toISOString(),
      };
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

      const { error } = await supabase
        .from("email_provider_settings")
        .upsert(payload, { onConflict: "company_id,provider" });
      if (error) throw error;
      // Snapshot the saved form state so hasUnsavedChanges goes back
      // to false. Without this the test-email button keeps blocking
      // with "save first" even after a successful save.
      setSavedSnapshot(JSON.stringify(row));
      toast({
        title: "Saved",
        description: verificationRelevantChanged && existing
          ? "Provider config updated. Domain verification reset because credentials changed."
          : "Provider config updated.",
      });
      return true;
    } catch (e: any) {
      captureException(e, {
        tags: { route: "/admin/email-settings", step: "save-provider", companyId },
      });
      toast({ title: "Save failed", description: e?.message || "Try again", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Compare the live form state against the last saved snapshot.
  // Cheap JSON.stringify is fine: the row object is small and only
  // ever updated by setRow, so reference-stability isn't required.
  const hasUnsavedChanges = JSON.stringify(row) !== savedSnapshot;

  // Send a test email to the operator's own from_email address [P1-05].
  // Uses /api/test-email which is now auth-gated (P0-05). Lands the
  // tenant-branded test in the operator's inbox so they can see what
  // their clients will see, without sending to a stranger.
  const sendTestEmail = async () => {
    // Pre-flight: surface the specific blocker so the operator isn't
    // told "set a from address" when the from address is clearly
    // already on screen. Three distinct failure shapes here:
    //   1. companyId is missing (super_admin view, or auth not loaded)
    //   2. from_email is empty in form state
    //   3. form is filled but not yet saved (DB hasn't caught up, the
    //      test endpoint will read stale data + fail in a confusing way)
    if (!companyId) {
      toast({
        title: "Couldn't identify your company",
        description: "Sign out and back in, then retry. If this keeps happening flag it to support.",
        variant: "destructive",
      });
      return;
    }
    if (!row.from_email || !row.from_email.trim()) {
      toast({
        title: "Add a from address first",
        description: "Fill in From address, save, then test.",
        variant: "destructive",
      });
      return;
    }
    // ES-D (task #235, 2026-06-01): instead of blocking the button on
    // unsaved changes, save first then test. The test endpoint reads
    // provider config from the DB, so the save has to land before the
    // send. Previously the button was greyed out with a hover-only
    // explanation - operators on a fresh tenant (no email_provider_settings
    // row yet) hit a dead button with no visible reason and gave up.
    setTesting(true);
    if (hasUnsavedChanges) {
      const ok = await save();
      if (!ok) {
        // save() already toasted the error; abort so we don't send a
        // test against half-written config.
        setTesting(false);
        return;
      }
    }
    // ES-B (task #221, 2026-05-25): if a custom recipient is set,
    // send the test there instead of the from address. Lets the
    // operator preview what a real client sees without flipping
    // their own from_email.
    const targetTo = (testRecipient.trim() || row.from_email)!;
    try {
      const res = await fetch("/api/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, to: targetTo }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        captureException(new Error(json.error || `HTTP ${res.status}`), {
          tags: {
            route: "/admin/email-settings",
            step: "send-test",
            companyId,
            error_code: json.error_code || "unknown",
          },
        });
        // TIGHTEN I.38: surface the structured error_code so operators
        // can act on the failure (e.g. resend_auth = "platform key
        // missing, ask support" vs from_email_domain_mismatch =
        // "change the from address") instead of seeing the same
        // useless generic message for every failure mode.
        const detail = json.error || "Could not send test email. Check provider config.";
        // TIGHTEN I.39: when resend_auth fires but the dashboard
        // claims the key is set, include the debug block in the toast
        // so we can tell at a glance whether the runtime is seeing it.
        let suffix = "";
        if (json.error_code) suffix = ` [${json.error_code}]`;
        if (json.debug) {
          const d = json.debug;
          suffix += ` (key_present=${d.resend_key_present} length=${d.resend_key_length} prefix=${d.resend_key_prefix} starts_with_re_=${d.resend_key_starts_with_re_} edge_ws=${d.resend_key_has_whitespace_edges} vercel_env=${d.vercel_env})`;
        }
        // TIGHTEN I.40: when the resend_auth was from Resend rejecting
        // the call (not env var missing), surface what Resend said so
        // the operator can tell rejected-by-Resend apart from
        // missing-on-server.
        if (json.context && (json.context.resend_status || json.context.resend_body_message)) {
          const c = json.context;
          suffix += ` resend_status=${c.resend_status ?? "?"} resend_says="${c.resend_body_message ?? c.resend_body_name ?? "?"}"`;
        }
        toast({
          title: "Test failed",
          description: `${detail}${suffix}`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Test sent",
        description: `Inbox: ${targetTo}. Check spam if it doesn't appear in 30 seconds.`,
      });
    } catch (e: any) {
      captureException(e, {
        tags: { route: "/admin/email-settings", step: "send-test-network", companyId },
      });
      toast({
        title: "Test failed",
        description: e?.message || "Network error",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const saveMailchimp = async () => {
    if (!companyId) return;
    try {
      const { error } = await supabase
        .from("email_provider_settings")
        .upsert({
          company_id: companyId,
          provider: "mailchimp",
          mailchimp_api_key_encrypted: mailchimpApiKey || undefined,
          mailchimp_audience_id: mailchimpAudienceId || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "company_id,provider" });
      if (error) throw error;
      setMailchimpApiKey(""); // clear local field after save
      toast({ title: "Mailchimp saved", description: "Audience linked. Bulk sends now route through Mailchimp." });
    } catch (e: any) {
      captureException(e, {
        tags: { route: "/admin/email-settings", step: "save-mailchimp", companyId },
      });
      toast({ title: "Save failed", description: e?.message || "Try again", variant: "destructive" });
    }
  };

  const capPct = Math.min(100, Math.round((todayCount / row.daily_send_cap) * 100));

  return (
    <>
      <NoIndexMeta />
      <Head><title>Email settings - CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-full">

          <div className="mb-6 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg flex-shrink-0">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2 flex-wrap">
                Email & Integrations
                <InfoTooltip content={"How CateringMS sends mail on your behalf, Gmail, Microsoft 365, or your own SMTP server, plus the daily send cap on your plan.\n\nDirect-send through your inbox is still being wired up; compose-link send works today."} />
              </h1>
              <p className="text-sm sm:text-base text-slate-600 mt-1">
                How CateringMS sends mail for you. Verify your domain so quotes, invoices and confirmations go out as you@yourdomain.com with proper SPF and DKIM. Gmail, Microsoft 365, and SMTP fallbacks live below.
              </p>
            </div>
          </div>

          {/* Daily quota tile */}
          <Card className="border-0 shadow-lg mb-6 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-slate-900">Today's send count</span>
                  <InfoTooltip content={"Counts emails sent straight from CateringMS through your provider.\n\nCompose-link clicks are tracked separately and don't count against this cap, since those go out through your own inbox."} />
                </div>
                <span className="text-2xl font-bold text-slate-900 tabular-nums">
                  {todayCount} <span className="text-sm font-normal text-slate-500">/ {row.daily_send_cap}</span>
                </span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    capPct > 90 ? "bg-red-500" : capPct > 70 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${capPct}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Your <Badge variant="outline" className="capitalize">{subscriptionPlan}</Badge> plan caps daily personal sends at <strong>{tierCap}</strong>. Tier rules in <Link href="/pricing" className="text-purple-600">Pricing</Link>.
              </p>

              {/* ES-B (task #221, 2026-05-25): 7-day send sparkline.
                  Reads from outgoing_email_log so the operator can
                  spot a trend before they hit the cap. Inline SVG to
                  avoid a chart-lib dep for one chart. */}
              {last7Counts.length > 0 && (() => {
                const max = Math.max(1, ...last7Counts.map((c) => c.count));
                const W = 280;
                const H = 40;
                const stepX = W / Math.max(1, last7Counts.length - 1);
                const points = last7Counts.map((c, i) => {
                  const x = i * stepX;
                  const y = H - (c.count / max) * (H - 4) - 2;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(" ");
                const total7 = last7Counts.reduce((s, c) => s + c.count, 0);
                return (
                  <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
                        Last 7 days
                      </p>
                      <p className="text-sm font-medium text-slate-700 tabular-nums">
                        {total7} sent · peak {max}/day
                      </p>
                    </div>
                    <svg width={W} height={H} className="overflow-visible">
                      <polyline
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={points}
                      />
                      {last7Counts.map((c, i) => {
                        const x = i * stepX;
                        const y = H - (c.count / max) * (H - 4) - 2;
                        return (
                          <circle key={c.day} cx={x} cy={y} r={2} fill="#2563eb">
                            <title>{c.day}: {c.count} sent</title>
                          </circle>
                        );
                      })}
                    </svg>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Resend domain verification - primary path */}
          <Card className="border-0 shadow-lg mb-6 bg-gradient-to-br from-white to-purple-50/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
                Use your own sending domain
                <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700">Recommended</span>
              </CardTitle>
              <CardDescription>
                Verify your domain once. After that, every quote, invoice and confirmation goes out as <code>you@yourdomain.com</code> with proper SPF + DKIM. Takes about 5 minutes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {companyId && (
                <ResendDomainCard
                  companyId={companyId}
                  onVerified={(d) => {
                    // Auto-set provider=resend after verification so the
                    // first save persists the new state.
                    setRow((r) => ({ ...r, provider: "resend" }));
                    if (!row.from_email || !row.from_email.toLowerCase().endsWith(`@${d}`)) {
                      // Suggest a sensible default if their from_email
                      // doesn't already live at the verified domain.
                      setRow((r) => ({
                        ...r,
                        from_email: `hello@${d}`,
                      }));
                    }
                  }}
                />
              )}
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                <p className="font-semibold mb-1">While your DNS is propagating</p>
                <p>
                  Your emails come from <code>noreply@send.cateringms.com</code> with replies routed back to your inbox. Once the DNS records are live (usually within an hour), your emails switch to your own domain automatically.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Advanced: alternative providers */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-purple-600" />
                Advanced: alternative providers
              </CardTitle>
              <CardDescription>
                Most caterers should use the verified-domain option above. These options exist for operators who already have a Gmail / Microsoft / SMTP setup they'd rather route through.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <ProviderTile
                  active={row.provider === "resend"}
                  onClick={() => setRow({ ...row, provider: "resend" })}
                  icon={Globe}
                  title="Verified domain"
                  sub="Through CateringMS (Resend)"
                  badge="Default"
                  badgeTone="bg-purple-100 text-purple-700"
                />
                <ProviderTile
                  active={row.provider === "gmail_oauth"}
                  onClick={() => setRow({ ...row, provider: "gmail_oauth" })}
                  icon={Mail}
                  title="Gmail"
                  sub="Sign in once with Google"
                />
                <ProviderTile
                  active={row.provider === "ms365_oauth"}
                  onClick={() => setRow({ ...row, provider: "ms365_oauth" })}
                  icon={Mail}
                  title="Microsoft 365"
                  sub="Sign in once with Microsoft"
                />
                <ProviderTile
                  active={row.provider === "smtp"}
                  onClick={() => setRow({ ...row, provider: "smtp" })}
                  icon={Server}
                  title="Custom SMTP"
                  sub="cPanel, Zoho, Fastmail, etc."
                />
              </div>

              {/* From identity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                <div>
                  <Label htmlFor="from_name">From name</Label>
                  <Input
                    id="from_name"
                    value={row.from_name || ""}
                    onChange={(e) => setRow({ ...row, from_name: e.target.value })}
                    placeholder="Spit Braai Delivery"
                  />
                </div>
                <div>
                  <Label htmlFor="from_email">
                    From address
                    <InfoTooltip content={"The address that shows up in the recipient's inbox.\n\nFor Gmail or Outlook sign-in, this is locked to the account you connected."} />
                  </Label>
                  <Input
                    id="from_email"
                    type="email"
                    value={row.from_email || ""}
                    onChange={(e) => setRow({ ...row, from_email: e.target.value })}
                    placeholder="hello@spitbraaidelivery.co.za"
                  />
                </div>
              </div>

              {/* OAuth: button to start sign-in flow (stub for now) */}
              {(row.provider === "gmail_oauth" || row.provider === "ms365_oauth") && (
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  {row.is_verified ? (
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-3">
                      <CheckCircle2 className="w-5 h-5" />
                      <div className="text-sm">
                        <p className="font-semibold">Connected as {row.oauth_account_email || row.from_email}</p>
                        <p className="text-xs text-emerald-600">Ready to send through your inbox.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-amber-50 border border-amber-200">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span className="text-sm text-amber-800">
                          Not connected yet, click below to authorise.
                        </span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => toast({ title: "Coming soon", description: "OAuth flow ships with the next deploy. Use SMTP or compose-links for now." })}
                        className="gap-2"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {row.provider === "gmail_oauth" ? "Connect Gmail" : "Connect Microsoft"}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* SMTP: host/port/user/pass */}
              {row.provider === "smtp" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                  <div>
                    <Label htmlFor="smtp_host">SMTP host</Label>
                    <Input id="smtp_host" value={row.smtp_host || ""} onChange={(e) => setRow({ ...row, smtp_host: e.target.value })} placeholder="mail.spitbraaidelivery.co.za" />
                  </div>
                  <div>
                    <Label htmlFor="smtp_port">Port</Label>
                    <Input id="smtp_port" type="number" value={row.smtp_port ?? 587} onChange={(e) => setRow({ ...row, smtp_port: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label htmlFor="smtp_user">Username</Label>
                    <Input id="smtp_user" value={row.smtp_user || ""} onChange={(e) => setRow({ ...row, smtp_user: e.target.value })} placeholder="hello@spitbraaidelivery.co.za" />
                  </div>
                  <div>
                    <Label htmlFor="smtp_pass">
                      Password
                      <InfoTooltip content={"Stored encrypted on our side.\n\nLeave this blank to keep the password you already saved."} />
                    </Label>
                    <Input id="smtp_pass" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="unchanged" />
                  </div>
                  <label className="flex items-center gap-2 text-sm md:col-span-2 cursor-pointer">
                    <input type="checkbox" checked={!!row.smtp_secure} onChange={(e) => setRow({ ...row, smtp_secure: e.target.checked })} />
                    Use TLS/SSL (recommended)
                  </label>
                </div>
              )}

              {/* Daily cap override */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="cap">
                    Daily send cap
                    <InfoTooltip content={`Your plan allows up to ${tierCap} a day. You can drop this lower if you want a tighter ceiling.\n\nOnly super-admin can raise it above the plan limit.`} />
                  </Label>
                  <Input
                    id="cap"
                    type="number"
                    min={1}
                    max={tierCap}
                    value={row.daily_send_cap}
                    onChange={(e) => setRow({ ...row, daily_send_cap: Math.min(Number(e.target.value), tierCap) })}
                  />
                </div>
              </div>

              {/* Shared-fallback sender disclosure [P1-06]. Until the
                  tenant verifies their own domain in Resend, sends fall
                  back to noreply@send.cateringms.com with Reply-To set
                  to the tenant's from_email. Operators were stuck
                  thinking they couldn't send anything until DNS
                  verified - explicitly tell them the fallback works. */}
              {row.provider === "resend" && !row.is_verified && row.from_email && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Domain not yet verified. Emails still go out from
                  <code className="mx-1 rounded bg-white px-1 py-0.5">noreply@send.cateringms.com</code>
                  with Reply-To set to {row.from_email}. Verify your domain
                  to switch to your own sender.
                </div>
              )}

              {/* ES-B (task #221, 2026-05-25): surface the last
                  test error if the most recent test failed. Pre-ES-B
                  the column was populated server-side but never
                  shown - so an operator had no breadcrumb when a
                  test silently failed weeks ago. */}
              {row.last_test_error && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold">Last test failed</p>
                    <p className="break-words">{row.last_test_error}</p>
                  </div>
                </div>
              )}

              {/* ES-B: custom test-recipient input. Defaults blank
                  so a quick test still lands in the from address;
                  fill in any inbox to preview what a real client
                  sees. */}
              <div className="pt-3 border-t border-slate-100">
                <Label htmlFor="test_recipient">
                  Send test to (optional)
                  <InfoTooltip content={"Leave blank to send the test to your from address. Drop in any inbox here to see what an actual client would receive."} />
                </Label>
                <Input
                  id="test_recipient"
                  type="email"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder={row.from_email || "you@example.com"}
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500 truncate">
                  {row.last_test_sent_at && (
                    <>Last connection check: {new Date(row.last_test_sent_at).toLocaleString("en-ZA")}</>
                  )}
                </p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    onClick={sendTestEmail}
                    disabled={testing || saving || !row.from_email}
                    variant="outline"
                    className="gap-2"
                    title={hasUnsavedChanges
                      ? `Save and send a test to ${testRecipient.trim() || row.from_email}`
                      : `Send a test email to ${testRecipient.trim() || row.from_email}`}
                  >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    {hasUnsavedChanges ? "Save & send test" : "Send test email"}
                  </Button>
                  <Button onClick={save} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    {hasUnsavedChanges ? "Save provider config" : "Saved"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Auto-attach client links to outgoing email */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-purple-600" />
                Auto-attach client links
                <InfoTooltip content={"Pick which moments automatically queue a client email with their secure order link. Repeat clients can also get a 'View all my events' link.\n\nWhile direct-send is being wired up, drafts queue here, you can copy and send any draft from your own inbox in the meantime."} />
              </CardTitle>
              <CardDescription>
                Automatically include the client's tokenised order link when these things happen.
                {queuedCount > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                    <BarChart3 className="w-3 h-3" /> {queuedCount} queued
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {row.provider === "none" && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    No provider connected yet. Toggles below queue drafts, the catering admin can copy any
                    draft to send manually until SMTP/OAuth is connected, then the queue drains
                    automatically.
                  </span>
                </div>
              )}
              <ToggleRow
                label="When a quote is marked sent"
                sub="Includes a magic 'View all my bookings' link for repeat customers"
                checked={row.auto_attach_on_quote_sent}
                onChange={(v) => setRow({ ...row, auto_attach_on_quote_sent: v })}
              />
              <ToggleRow
                label="When a new order is confirmed"
                sub="Sends the tokenised order link automatically"
                checked={row.auto_attach_on_order_confirmed}
                onChange={(v) => setRow({ ...row, auto_attach_on_order_confirmed: v })}
              />
              <ToggleRow
                label="When an order status changes"
                sub="Useful for 'preparing -> ready -> on the way' updates. Off by default to avoid noise."
                checked={row.auto_attach_on_order_status_change}
                onChange={(v) => setRow({ ...row, auto_attach_on_order_status_change: v })}
              />
              <div className="border-t border-slate-100 pt-3">
                <ToggleRow
                  label="Repeat-customer magic link"
                  sub={`When a client has at least ${row.magic_link_repeat_threshold} prior orders, also include a /c/account magic link so they can see every booking they've ever placed with you.`}
                  checked={row.magic_link_repeat_customers}
                  onChange={(v) => setRow({ ...row, magic_link_repeat_customers: v })}
                />
                <div className="mt-2 ml-1 flex items-center gap-2 text-xs">
                  <span className="text-slate-600">Threshold:</span>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={row.magic_link_repeat_threshold}
                    onChange={(e) => setRow({ ...row, magic_link_repeat_threshold: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-20 h-8"
                  />
                  <span className="text-slate-500">prior orders</span>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <ToggleRow
                  label="Revoke old links when a new one is generated"
                  sub="Tightens privacy: each new event email's link supersedes the previous one. Off by default so forwarded links keep working."
                  checked={row.revoke_old_links_on_new}
                  onChange={(v) => setRow({ ...row, revoke_old_links_on_new: v })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Mailchimp integration */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="w-5 h-5 text-orange-600" />
                Mailchimp (bulk sender)
              </CardTitle>
              <CardDescription>
                For newsletters, campaigns, and big lists. Personal emails stay in CateringMS; Mailchimp handles bulk.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="mc_api">API key
                  <InfoTooltip content={"In Mailchimp, head to Account > Extras > API keys to grab one.\n\nStored encrypted on our side."} />
                </Label>
                <Input id="mc_api" type="password" value={mailchimpApiKey} onChange={(e) => setMailchimpApiKey(e.target.value)} placeholder={mailchimpAudienceId ? "unchanged" : "Enter Mailchimp API key"} />
              </div>
              <div>
                <Label htmlFor="mc_aud">Audience ID</Label>
                <Input id="mc_aud" value={mailchimpAudienceId} onChange={(e) => setMailchimpAudienceId(e.target.value)} placeholder="abcd1234" />
              </div>
              <div className="flex items-center justify-between pt-2">
                <Link href="https://us1.admin.mailchimp.com/account/api/" target="_blank" rel="noopener" className="text-xs text-purple-600 hover:underline flex items-center gap-1">
                  Get your API key from Mailchimp <ExternalLink className="w-3 h-3" />
                </Link>
                <Button variant="outline" onClick={saveMailchimp} className="gap-2">
                  <Sparkles className="w-4 h-4" />
                  Save Mailchimp link
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Status / next steps */}
          <Card className="border-0 shadow bg-slate-50">
            <CardContent className="py-4 text-xs text-slate-600 space-y-1">
              <p><strong>How sends are tracked:</strong> compose-link clicks (Gmail / Outlook / mailto / clipboard) are logged to outgoing_email_log but don't count against your daily cap because they go through your own inbox quota.</p>
              <p><strong>Direct send:</strong> activates once Gmail OAuth, MS 365 OAuth or SMTP is verified. Until then the Clients CRM uses compose-links only.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function ToggleRow({
  label, sub, checked, onChange,
}: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 cursor-pointer transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
      </div>
      <span className="relative inline-flex flex-shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <span className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-purple-600 transition-colors" />
        <span className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

function ProviderTile({
  active, onClick, icon: Icon, title, sub, badge, badgeTone,
}: any) {
  return (
    <button
      onClick={onClick}
      className={`relative text-left p-4 rounded-xl border-2 transition-all ${
        active
          ? "border-purple-500 bg-purple-50 shadow-md"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      {badge && (
        <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${badgeTone}`}>
          {badge}
        </span>
      )}
      <Icon className={`w-6 h-6 mb-2 ${active ? "text-purple-600" : "text-slate-500"}`} />
      <p className={`font-semibold text-sm ${active ? "text-purple-900" : "text-slate-900"}`}>{title}</p>
      <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
    </button>
  );
}

export default function ProtectedEmailSettings() {
  // ES-B (task #221, 2026-05-25): admit OWNER. Pre-ES-B the page
  // hardcoded SUPER_ADMIN + COMPANY_ADMIN + ADMIN, so the OWNER
  // persona was 403'd off their own email/integration page. Same
  // regression pattern as the rest of /admin.
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN,
      UserRole.OWNER,
      UserRole.COMPANY_ADMIN,
      UserRole.ADMIN,
    ]}>
      <EmailSettingsPage />
    </ProtectedRoute>
  );
}
