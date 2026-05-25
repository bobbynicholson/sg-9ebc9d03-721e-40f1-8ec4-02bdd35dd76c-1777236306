/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * ResendDomainCard - the per-tenant sending domain widget.
 *
 * Used by /admin/email-settings (primary tile) and the onboarding
 * wizard's email step. Wraps the create-domain / verify-domain /
 * delete-domain API routes and renders the DNS record table the
 * operator copies into their domain host's control panel.
 *
 * State machine:
 *   no domain saved   -> "Add domain" form
 *   pending            -> calm waiting card + auto-poll + live diagnostic
 *   verified           -> green success card
 *   failed             -> red banner with retry
 *
 * Auto-poll: while pending, fetch /api/admin/resend/verify-domain every
 * 60s and refresh the live DNS diagnostic from /api/admin/resend/dns-check.
 * Caps at 60 minutes total elapsed.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2, Loader2, RefreshCw, Globe, Copy, AlertTriangle,
  ShieldCheck, RotateCcw, Clock, ExternalLink, Info, HelpCircle, Mail,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DnsRecord {
  record?: string;
  name: string;
  value: string;
  type: string;
  ttl?: string | number;
  priority?: number;
  status?: string;
}

interface DomainState {
  id?: string;
  domain?: string | null;
  status?: string | null;       // 'pending' | 'verified' | 'failed' | 'not_started'
  verifiedAt?: string | null;
  lastCheckedAt?: string | null;
  records: DnsRecord[];
  /** LCF-N: when true, mail goes via noreply@send.cateringms.com even
   *  if the tenant's Resend domain is verified. */
  forcePlatformSender?: boolean;
  fromEmail?: string | null;
  fromName?: string | null;
}

interface DnsCheckRecord {
  name: string;
  type: string;
  expected_value?: string;
  found_values?: string[];
  match?: boolean;
  diagnosis?: string;
}

interface DnsCheckResponse {
  domain?: string;
  summary?: {
    all_match?: boolean;
    propagation_likely?: boolean;
    next_action?: string;
  };
  records?: DnsCheckRecord[];
}

interface Props {
  companyId: string;
  /** Called when verification flips to verified, so callers can refresh
   *  the from_email lock state. */
  onVerified?: (domain: string) => void;
  /** Hides the heading - when embedded inside another card. */
  compact?: boolean;
}

const POLL_INTERVAL_MS = 60_000;
const MAX_POLL_DURATION_MS = 60 * 60 * 1000; // 60 minutes
const PENDING_STATES = new Set(["pending", "not_started", null, undefined, ""]);

function isPending(status: string | null | undefined): boolean {
  return PENDING_STATES.has(status as any);
}

export function ResendDomainCard({ companyId, onVerified, compact }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [forceVerifying, setForceVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [state, setState] = useState<DomainState>({ records: [] });

  // Auto-poll state.
  const [diagnostic, setDiagnostic] = useState<DnsCheckResponse | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticUnavailable, setDiagnosticUnavailable] = useState(false);
  const [secondsToNextCheck, setSecondsToNextCheck] = useState<number>(POLL_INTERVAL_MS / 1000);
  const [lastCheckedClient, setLastCheckedClient] = useState<Date | null>(null);
  const [pollStartedAt, setPollStartedAt] = useState<Date | null>(null);
  const [pollExhausted, setPollExhausted] = useState(false);
  const [justVerified, setJustVerified] = useState(false);

  const pollTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const previousStatusRef = useRef<string | null | undefined>(undefined);

  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("email_provider_settings")
      .select(
        "id, resend_domain_id, resend_sending_domain, resend_dns_records, resend_domain_status, resend_domain_verified_at, resend_last_checked_at, force_platform_sender, from_email, from_name",
      )
      .eq("company_id", companyId)
      .eq("provider", "resend")
      .maybeSingle();
    if (error) {
      console.error("[ResendDomainCard] email_provider_settings fetch failed:", error);
    }
    setState({
      id: (data as any)?.resend_domain_id,
      domain: (data as any)?.resend_sending_domain || null,
      status: (data as any)?.resend_domain_status || null,
      verifiedAt: (data as any)?.resend_domain_verified_at || null,
      lastCheckedAt: (data as any)?.resend_last_checked_at || null,
      records: Array.isArray((data as any)?.resend_dns_records)
        ? (data as any).resend_dns_records
        : [],
      forcePlatformSender: !!(data as any)?.force_platform_sender,
      fromEmail: (data as any)?.from_email || null,
      fromName: (data as any)?.from_name || null,
    });
    setLoading(false);
  };

  // LCF-N: toggle the platform-sender override. Updates the row in
  // place, no Resend API call - we deliberately keep the verified-
  // domain object intact so flipping back is a single tap. The
  // resolver in emailService.resolveFromAddress short-circuits to
  // the shared sender when this flag is true.
  const [togglingForce, setTogglingForce] = useState(false);
  const toggleForcePlatformSender = async () => {
    if (!companyId) return;
    setTogglingForce(true);
    try {
      const next = !state.forcePlatformSender;
      const { error } = await supabase
        .from("email_provider_settings")
        .update({ force_platform_sender: next, updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("provider", "resend");
      if (error) throw error;
      setState((s) => ({ ...s, forcePlatformSender: next }));
      toast({
        title: next ? "Routing via platform default" : "Routing via your domain",
        description: next
          ? `Emails go from noreply@send.cateringms.com with reply-to ${state.fromEmail || "your inbox"}. DNS records stay in place.`
          : state.verifiedAt
            ? `Emails go from ${state.fromEmail || "your domain"} again.`
            : "Once Resend finishes verifying, sends will switch to your domain automatically.",
      });
    } catch (e: any) {
      setError(e?.message || "Could not update sender setting");
    } finally {
      setTogglingForce(false);
    }
  };

  // What address will recipients actually see? Mirrors the resolver in
  // services/emailService.resolveFromAddress so this card and the
  // outbound mail agree.
  const effectiveSender = useMemo(() => {
    const verified = !!state.verifiedAt;
    const domain = (state.domain || "").toLowerCase();
    const fromEmail = (state.fromEmail || "").toLowerCase();
    const matchesDomain = !!(domain && fromEmail && fromEmail.endsWith("@" + domain));
    const usingTenantDomain = verified && matchesDomain && !state.forcePlatformSender;
    return {
      usingTenantDomain,
      label: usingTenantDomain
        ? (state.fromEmail || "your domain")
        : "noreply@send.cateringms.com",
      replyTo: usingTenantDomain ? null : (state.fromEmail || null),
    };
  }, [state.verifiedAt, state.domain, state.fromEmail, state.forcePlatformSender]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Fetch the live DNS diagnostic. Gracefully degrades if the endpoint
  // 404s (sibling agent may not have shipped yet).
  const refreshDiagnostic = async () => {
    if (!state.domain) return;
    if (diagnosticUnavailable) return;
    setDiagnosticLoading(true);
    try {
      const res = await fetch("/api/admin/resend/dns-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.status === 404) {
        setDiagnosticUnavailable(true);
        return;
      }
      if (!res.ok) {
        // Soft fail - don't surface this to the operator, the auto-poll
        // verify call is the source of truth.
        return;
      }
      const body: DnsCheckResponse = await res.json();
      setDiagnostic(body);
    } catch {
      // Network blip - next tick will retry.
    } finally {
      setDiagnosticLoading(false);
    }
  };

  // Core verify call. Used by the auto-poll tick AND the manual button.
  const runVerify = async (manual: boolean): Promise<void> => {
    if (manual) setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/resend/verify-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json();
      setLastCheckedClient(new Date());
      if (!res.ok) {
        if (manual) {
          setError(body.error || `Verify failed (HTTP ${res.status}).`);
        }
        return;
      }
      await reload();
      if (body.status === "verified") {
        setJustVerified(true);
        toast({
          title: "Verified",
          description: `Emails will now go out from ${body.domain}.`,
        });
        if (body.newly_verified && onVerified) onVerified(body.domain);
      } else if (manual && body.status === "pending") {
        // Two pending sub-states deserve different copy. If the live
        // diagnostic already says everything matches, DNS is fine and
        // we're just waiting on Resend's internal check to flip.
        const dnsAllMatch = !!diagnostic?.summary?.all_match;
        toast({
          title: dnsAllMatch ? "Waiting on Resend" : "Still propagating",
          description: dnsAllMatch
            ? "DNS records are live and correct. Resend is running its own check now. This usually flips to verified within a minute or two, we'll keep polling."
            : "DNS hasn't fully published yet. We'll keep checking automatically.",
        });
      } else if (manual && body.status === "failed") {
        toast({
          title: "Verification failed",
          description: "See the diagnostic below for which record is wrong.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      if (manual) setError(e?.message || "Network error");
    } finally {
      if (manual) setVerifying(false);
    }
  };

  // Stop any running timers.
  const stopPolling = () => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  };

  // Auto-poll while pending. Re-runs whenever status / domain / pollExhausted change.
  useEffect(() => {
    stopPolling();

    if (!state.domain) return;
    if (!isPending(state.status)) return;
    if (pollExhausted) return;

    // Mark when the polling session started (used for the 60-min cap).
    if (!pollStartedAt) setPollStartedAt(new Date());

    // Kick off an immediate diagnostic refresh on mount of pending state.
    void refreshDiagnostic();

    setSecondsToNextCheck(POLL_INTERVAL_MS / 1000);

    // Countdown (UI tick).
    countdownTimerRef.current = window.setInterval(() => {
      setSecondsToNextCheck((s) => (s <= 1 ? POLL_INTERVAL_MS / 1000 : s - 1));
    }, 1000);

    // Verify + diagnostic poll.
    pollTimerRef.current = window.setInterval(() => {
      const startedAt = pollStartedAt ?? new Date();
      if (Date.now() - startedAt.getTime() > MAX_POLL_DURATION_MS) {
        setPollExhausted(true);
        stopPolling();
        return;
      }
      void runVerify(false);
      void refreshDiagnostic();
    }, POLL_INTERVAL_MS);

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.domain, state.status, pollExhausted]);

  // Reset poll session when domain changes.
  useEffect(() => {
    setPollStartedAt(null);
    setPollExhausted(false);
    setDiagnostic(null);
    setDiagnosticUnavailable(false);
    setLastCheckedClient(null);
  }, [state.domain]);

  // Track verified flip for the celebration animation.
  useEffect(() => {
    const prev = previousStatusRef.current;
    if (prev && prev !== "verified" && state.status === "verified") {
      setJustVerified(true);
    }
    previousStatusRef.current = state.status;
  }, [state.status]);

  const submitDomain = async (force: boolean = false) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/resend/create-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput, force }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 409 && body.existing) {
          setError(
            `${body.error} Click "Replace existing" to overwrite ${body.existing.domain}.`,
          );
          return;
        }
        setError(body.error || `Resend rejected the request (HTTP ${res.status}).`);
        return;
      }
      setDomainInput("");
      await reload();
      toast({
        title: "Domain registered",
        description: `Add the DNS records below to verify ${body.domain}.`,
      });
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyManual = async () => {
    // Trigger an immediate poll instead of waiting for the timer.
    setSecondsToNextCheck(POLL_INTERVAL_MS / 1000);
    await Promise.all([runVerify(true), refreshDiagnostic()]);
  };

  const forceReverify = async () => {
    if (
      !window.confirm(
        "Force re-verification?\n\nThis deletes the stuck domain object at Resend and re-creates it with the same hostname, giving Resend a fresh verification cycle. Resend's DKIM keys are deterministic per domain, so your DNS records stay byte-identical, you do NOT need to touch your DNS host.\n\nUse this when verification has been stuck on pending for over an hour despite the live DNS diagnostic showing every record as matched.",
      )
    ) {
      return;
    }
    setForceVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/resend/force-reverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || `Force re-verify failed (HTTP ${res.status}).`);
        return;
      }
      await reload();
      await refreshDiagnostic();
      const flipped = body.status === "verified";
      toast({
        title: flipped ? "Verified" : "Fresh verification triggered",
        description: flipped
          ? `Emails will now go out from ${body.domain}.`
          : "Resend's verifier is running against the new domain object. Usually flips within a minute.",
      });
      if (flipped && onVerified) onVerified(body.domain);
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setForceVerifying(false);
    }
  };

  const reset = async () => {
    if (
      !window.confirm(
        "Remove this domain from CateringMS? You'll need to re-add the DNS records if you want to use it again.",
      )
    ) {
      return;
    }
    setResetting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/resend/delete-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || `Reset failed (HTTP ${res.status}).`);
        return;
      }
      await reload();
      toast({
        title: "Domain reset",
        description: "You can register a new sending domain anytime.",
      });
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setResetting(false);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: label });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the text manually.",
        variant: "destructive",
      });
    }
  };

  const statusBadge = useMemo(() => {
    const s = state.status;
    if (s === "verified") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="w-3 h-3" /> Verified
        </span>
      );
    }
    if (isPending(s)) {
      // Differentiate the two pending sub-states:
      //  - records not yet visible in DNS  -> truly propagating
      //  - records live + match but Resend hasn't flipped yet -> waiting on Resend
      const allMatch = !!diagnostic?.summary?.all_match;
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
          <Loader2 className="w-3 h-3 animate-spin" />
          {allMatch ? "Verifying with Resend" : "Propagating"}
        </span>
      );
    }
    if (s === "failed") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
          <AlertTriangle className="w-3 h-3" /> Action needed
        </span>
      );
    }
    return null;
  }, [state.status, diagnostic]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading domain state...
      </div>
    );
  }

  // No domain registered yet.
  if (!state.domain) {
    return (
      <div className="space-y-3">
        {!compact && (
          <div className="flex items-start gap-2">
            <Globe className="w-5 h-5 text-purple-600 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">
                Verify your sending domain
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Lets you send from <code>you@yourdomain.com</code> with proper SPF + DKIM.
              </p>
            </div>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            placeholder="spitbraaidelivery.co.za"
            className="flex-1"
          />
          <Button
            onClick={() => submitDomain(false)}
            disabled={submitting || !domainInput.trim()}
            className="gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Add domain
          </Button>
        </div>
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <p className="text-[11px] text-slate-500">
          Use the apex domain (e.g. <code>spitbraaidelivery.co.za</code>) or a sending subdomain (e.g. <code>mail.spitbraaidelivery.co.za</code>).
        </p>
      </div>
    );
  }

  const pending = isPending(state.status);
  const verified = state.status === "verified";
  const failed = state.status === "failed";

  return (
    <div className="space-y-3">
      {/* Header row - domain + status chip. */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-purple-600" />
          <div>
            <p className="font-semibold text-slate-900 break-all">{state.domain}</p>
            {state.verifiedAt && (
              <p className="text-[11px] text-slate-500">
                Verified {new Date(state.verifiedAt).toLocaleString("en-ZA")}
              </p>
            )}
            {!state.verifiedAt && state.lastCheckedAt && (
              <p className="text-[11px] text-slate-500">
                Last server check {new Date(state.lastCheckedAt).toLocaleString("en-ZA")}
              </p>
            )}
          </div>
        </div>
        {statusBadge}
      </div>

      {/* LCF-N: "Currently sending as" panel. Shows the actual address
          recipients will see today, with a single toggle to flip
          between the verified-domain sender and the platform shared
          sender. The DNS records stay in place either way. */}
      <div
        className={`rounded-lg border p-3 flex items-start gap-3 ${
          effectiveSender.usingTenantDomain
            ? "border-emerald-200 bg-emerald-50"
            : "border-blue-200 bg-blue-50"
        }`}
      >
        <Mail
          className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
            effectiveSender.usingTenantDomain ? "text-emerald-700" : "text-blue-700"
          }`}
        />
        <div className="flex-1 min-w-0">
          <p
            className={`text-xs font-semibold uppercase tracking-wide ${
              effectiveSender.usingTenantDomain ? "text-emerald-700" : "text-blue-700"
            }`}
          >
            Currently sending as
          </p>
          <p className="text-sm font-mono text-slate-900 break-all mt-0.5">
            {(state.fromName ? `${state.fromName} <` : "") + effectiveSender.label + (state.fromName ? ">" : "")}
          </p>
          {effectiveSender.replyTo && (
            <p className="text-[11px] text-slate-600 mt-0.5">
              Replies route to <code className="font-mono">{effectiveSender.replyTo}</code>
            </p>
          )}
          {state.forcePlatformSender ? (
            <p className="text-[11px] text-blue-900 mt-1">
              Override on: sending via platform default even though your domain is set up. Toggle off to switch back.
            </p>
          ) : !effectiveSender.usingTenantDomain && state.verifiedAt ? (
            <p className="text-[11px] text-slate-600 mt-1">
              Your domain is verified but your <code>from</code> address doesn't live at <code>@{state.domain}</code>. Set the From address to something like <code>hello@{state.domain}</code> in the form below.
            </p>
          ) : !effectiveSender.usingTenantDomain ? (
            <p className="text-[11px] text-slate-600 mt-1">
              Resend hasn't flipped your domain to verified yet. Sends use the platform shared address with reply-to set to your inbox until verification completes.
            </p>
          ) : null}
        </div>

        {/* Toggle: only show after the domain object exists. Pre-add we
            don't need it since there's no verified path to opt out of. */}
        {state.domain && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleForcePlatformSender}
            disabled={togglingForce}
            className="text-[11px] h-7 shrink-0"
            title={
              state.forcePlatformSender
                ? "Switch sends back to your verified domain"
                : "Send via the platform default for now (keeps DNS work intact)"
            }
          >
            {togglingForce
              ? "Switching..."
              : state.forcePlatformSender
                ? "Use my domain"
                : "Use platform default"}
          </Button>
        )}
      </div>

      {/* VERIFIED CELEBRATION */}
      {verified && (
        <div
          className={`rounded-lg border border-emerald-300 bg-emerald-50 p-4 ${
            justVerified ? "animate-in fade-in duration-700" : ""
          }`}
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-emerald-900">
                Verified - you're ready to send
              </p>
              <p className="text-sm text-emerald-800">
                Outgoing emails for this company will now arrive at your clients showing
                <strong className="ml-1">@{state.domain}</strong> as the sender.
                Send a test from <code>/admin/invoices</code> or <code>/admin/quotes</code> to confirm.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PENDING - two distinct sub-states. We separate them because
          the same status word covers two very different situations and
          the user needs different reassurance for each. */}
      {pending && !verified && (() => {
        const dnsAllMatch = !!diagnostic?.summary?.all_match;
        if (dnsAllMatch) {
          return (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="font-semibold text-amber-900">Waiting on Resend's verifier</p>
                  <p className="text-sm text-amber-900/90">
                    Your DNS records are live and match exactly what Resend asked for (we just confirmed all three from public DNS, see the green ticks below). Now Resend's own verifier needs to run its DNS check and flip the status.
                    <strong> This is on Resend's side, not yours and not ours.</strong> It usually flips within a minute or two of clicking Verify now.
                  </p>
                  <ul className="text-xs text-amber-900/80 space-y-0.5 ml-1">
                    <li>Hit <strong>Verify now</strong> at the bottom of this card to trigger another check.</li>
                    <li>If still pending after 5 minutes of trying, see "Still stuck?" below.</li>
                  </ul>
                </div>
              </div>
            </div>
          );
        }
        return (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-semibold text-amber-900">DNS propagation in progress</p>
                <p className="text-sm text-amber-900/90">
                  Your DNS host has the records. They're now propagating across the internet's name servers,
                  which typically takes 5-30 minutes but can take up to an hour.
                  <strong> This is on your DNS host's side, not ours, we'll keep checking automatically every minute.</strong>
                </p>
                <ul className="text-xs text-amber-900/80 space-y-0.5 ml-1">
                  <li>Most common timing: 5-15 minutes.</li>
                  <li>Worst case: 60 minutes.</li>
                  <li>If it's been over 2 hours, see "Still stuck?" below.</li>
                </ul>
              </div>
            </div>
          </div>
        );
      })()}

      {/* FAILED - distinct from pending, this is operator-actionable. */}
      {failed && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">Verification failed</p>
            <p className="text-xs mt-0.5">
              Resend rejected the records. See the diagnostic below for which entry is wrong, fix it at your DNS host, then click <strong>Verify now</strong>.
            </p>
          </div>
        </div>
      )}

      {/* LIVE DNS DIAGNOSTIC PANEL */}
      {!verified && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Info className="w-3.5 h-3.5" />
              Live DNS diagnostic
              {diagnosticLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
            </div>
            {pending && !pollExhausted && (
              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                {lastCheckedClient && (
                  <span>
                    Last checked at {lastCheckedClient.toLocaleTimeString("en-ZA")}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Next check in {secondsToNextCheck}s
                </span>
              </div>
            )}
            {pollExhausted && (
              <span className="text-[11px] text-amber-700">
                Auto-check stopped after 60 minutes. Use Verify now manually.
              </span>
            )}
          </div>

          {/* next_action banner */}
          {diagnostic?.summary?.next_action && (
            <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-900">
              <strong>Next:</strong> {diagnostic.summary.next_action}
            </div>
          )}

          {diagnosticUnavailable && (
            <div className="px-3 py-2 text-[11px] text-slate-500 border-b border-slate-100">
              Live diagnostic temporarily unavailable. Falling back to the records table below.
            </div>
          )}

          {/* If we have live diagnostic results, render them. Otherwise
              fall back to the raw records table. */}
          {diagnostic?.records && diagnostic.records.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-white border-b border-slate-200">
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2 font-semibold w-10"></th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnostic.records.map((r, idx) => {
                    const matched = !!r.match;
                    const found = Array.isArray(r.found_values) ? r.found_values : [];
                    const wrongValue = !matched && found.length > 0;
                    const stillPropagating = !matched && found.length === 0;
                    return (
                      <tr key={idx} className="border-b border-slate-100 last:border-0 align-top">
                        <td className="px-3 py-2">
                          {matched && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                          {wrongValue && <AlertTriangle className="w-4 h-4 text-red-600" />}
                          {stillPropagating && <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700">{r.type}</td>
                        <td className="px-3 py-2 font-mono break-all">{r.name}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {matched && <span className="text-emerald-700 font-semibold">Match</span>}
                          {wrongValue && <span className="text-red-700 font-semibold">Wrong value published</span>}
                          {stillPropagating && <span className="text-amber-700">Still propagating</span>}
                          {r.diagnosis && (
                            <p className="text-[11px] text-slate-500 mt-0.5">{r.diagnosis}</p>
                          )}
                          {wrongValue && found.length > 0 && (
                            <p className="text-[11px] text-red-600 mt-0.5 break-all">
                              Found: <code>{found.join(", ")}</code>
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            // Fallback - the original records table for copy-paste.
            state.records.length > 0 && (
              <>
                <div className="px-3 py-2 text-xs text-slate-600 bg-white border-b border-slate-200">
                  Add these DNS records at your domain host (cPanel, Cloudflare, Domains.co.za, etc.) then click <strong>Verify now</strong>.
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white border-b border-slate-200">
                      <tr className="text-left text-slate-500">
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Name / Host</th>
                        <th className="px-3 py-2 font-semibold">Value</th>
                        <th className="px-3 py-2 font-semibold">TTL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.records.map((r, idx) => (
                        <tr key={idx} className="border-b border-slate-100 last:border-0 align-top">
                          <td className="px-3 py-2 font-mono text-slate-700">{r.type}</td>
                          <td className="px-3 py-2 font-mono break-all">
                            <div className="flex items-start gap-1">
                              <span className="flex-1">{r.name}</span>
                              <button
                                type="button"
                                onClick={() => copy(r.name, "Name copied")}
                                className="text-slate-400 hover:text-purple-600 p-0.5"
                                title="Copy name"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono break-all max-w-md">
                            {r.priority != null && (
                              <div className="flex items-start gap-1 mb-1">
                                <span className="text-[11px] text-slate-500 font-sans">Priority:</span>
                                <span className="flex-1">{r.priority}</span>
                                <button
                                  type="button"
                                  onClick={() => copy(String(r.priority), "Priority copied")}
                                  className="text-slate-400 hover:text-purple-600 p-0.5"
                                  title="Copy priority"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                            <div className="flex items-start gap-1">
                              {r.priority != null && (
                                <span className="text-[11px] text-slate-500 font-sans">Destination:</span>
                              )}
                              <span className="flex-1">{r.value}</span>
                              <button
                                type="button"
                                onClick={() => copy(r.value, "Value copied")}
                                className="text-slate-400 hover:text-purple-600 p-0.5"
                                title="Copy value"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{r.ttl ?? "Auto"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          )}
        </div>
      )}

      {/* RAW RECORDS REFERENCE - collapsible when diagnostic is present so
          the operator can still copy values if they need to fix something. */}
      {!verified && diagnostic?.records && diagnostic.records.length > 0 && state.records.length > 0 && (
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 select-none">
            View / copy the records you should be publishing
          </summary>
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Value</th>
                </tr>
              </thead>
              <tbody>
                {state.records.map((r, idx) => (
                  <tr key={idx} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="px-3 py-2 font-mono">{r.type}</td>
                    <td className="px-3 py-2 font-mono break-all">
                      <div className="flex items-start gap-1">
                        <span className="flex-1">{r.name}</span>
                        <button
                          type="button"
                          onClick={() => copy(r.name, "Name copied")}
                          className="text-slate-400 hover:text-purple-600 p-0.5"
                          title="Copy name"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono break-all max-w-md">
                      <div className="flex items-start gap-1">
                        <span className="flex-1">{r.value}</span>
                        <button
                          type="button"
                          onClick={() => copy(r.value, "Value copied")}
                          className="text-slate-400 hover:text-purple-600 p-0.5"
                          title="Copy value"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* COMMON MISTAKES CHECKLIST */}
      {!verified && (
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 select-none flex items-center gap-2">
            <HelpCircle className="w-3.5 h-3.5" />
            Still stuck after 30 minutes?
          </summary>
          <div className="px-3 py-3 border-t border-slate-100 space-y-2 text-xs text-slate-700">
            <div>
              <p className="font-semibold text-slate-900">1. Did you accidentally type the full domain in the Name field?</p>
              <p className="mt-0.5">
                Most DNS hosts auto-append your domain. If you typed
                <code className="mx-1">resend._domainkey.{state.domain}</code>
                it'll save as
                <code className="mx-1">resend._domainkey.{state.domain}.{state.domain}</code> - wrong.
                Should be just <code>resend._domainkey</code>.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">2. Did the long DKIM value paste in full?</p>
              <p className="mt-0.5">
                Some DNS hosts truncate at 255 characters. Open the saved record and check it ends with <code>IDAQAB</code>.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">3. Cloudflare users - is the proxy (orange cloud) OFF?</p>
              <p className="mt-0.5">
                DNS-only mode is required for email auth. The orange cloud must be grey for these records.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">4. Did you save each record individually?</p>
              <p className="mt-0.5">
                Some hosts have an "add" button that doesn't actually persist until you click "save zone" / "apply changes".
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">5. Are there extra quotes or whitespace?</p>
              <p className="mt-0.5">
                Some hosts wrap TXT values in quotes that break the record. Compare the saved value character-for-character against the source.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <a
                href={`https://dnschecker.org/?type=TXT&query=resend._domainkey.${encodeURIComponent(state.domain)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 underline-offset-2 hover:underline"
              >
                Independently verify the DKIM record on dnschecker.org
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </details>
      )}

      {/* WHAT'S HAPPENING BEHIND THE SCENES */}
      {!verified && (
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 select-none flex items-center gap-2">
            <Info className="w-3.5 h-3.5" />
            What's actually happening
          </summary>
          <div className="px-3 py-3 border-t border-slate-100 space-y-2 text-xs text-slate-700">
            <p>
              When you save a DNS record at your domain host, your host pushes that change to its name servers.
              Other name servers (Resend's, your client's email provider, etc.) cache DNS records for performance,
              so they don't see your change immediately - they have to wait until their cached copy expires (the TTL).
            </p>
            <p>
              Most DNS hosts default to a 1-hour TTL. Some use shorter values like 5 minutes.
              Resend checks every minute or so once it sees activity on a domain.
            </p>
            <p>
              Once Resend confirms your records, this status flips to Verified and you're live.
            </p>
          </div>
        </details>
      )}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ACTIONS ROW */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={reset}
            disabled={resetting}
            className="text-xs text-slate-500 hover:text-red-600 underline-offset-2 hover:underline inline-flex items-center gap-1"
          >
            {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            Reset domain
          </button>
          {/* Force re-verify only meaningful when stuck on pending and
              the live diagnostic confirms DNS is matched. Surfacing it
              elsewhere would just confuse. */}
          {!verified && diagnostic?.summary?.all_match && (
            <button
              type="button"
              onClick={forceReverify}
              disabled={forceVerifying}
              className="text-xs text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline inline-flex items-center gap-1"
              title="Delete + re-create the Resend domain object to kick a stuck verifier loose. DNS records stay identical, you don't need to change anything at your DNS host."
            >
              {forceVerifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Force re-verify
            </button>
          )}
        </div>
        {!verified && (
          <Button onClick={verifyManual} disabled={verifying} size="sm" className="gap-2">
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Verify now
          </Button>
        )}
      </div>
    </div>
  );
}
