/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * ResendDomainCard -- the per-tenant sending domain widget.
 *
 * Used by /admin/email-settings (primary tile) and the onboarding
 * wizard's email step. Wraps the create-domain / verify-domain /
 * delete-domain API routes and renders the DNS record table the
 * operator copies into their domain host's control panel.
 *
 * State machine:
 *   no domain saved   -> "Add domain" form
 *   pending            -> show DNS records + "Verify now" button
 *   verified           -> green tick + reset link
 *   failed             -> red banner with retry
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2, Loader2, RefreshCw, Globe, Copy, AlertTriangle,
  ShieldCheck, RotateCcw,
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
  status?: string | null;       // 'pending' | 'verified' | 'failed'
  verifiedAt?: string | null;
  lastCheckedAt?: string | null;
  records: DnsRecord[];
}

interface Props {
  companyId: string;
  /** Called when verification flips to verified, so callers can refresh
   *  the from_email lock state. */
  onVerified?: (domain: string) => void;
  /** Hides the heading -- when embedded inside another card. */
  compact?: boolean;
}

export function ResendDomainCard({ companyId, onVerified, compact }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [state, setState] = useState<DomainState>({ records: [] });

  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("email_provider_settings")
      .select(
        "id, resend_domain_id, resend_sending_domain, resend_dns_records, resend_domain_status, resend_domain_verified_at, resend_last_checked_at",
      )
      .eq("company_id", companyId)
      .eq("provider", "resend")
      .maybeSingle();
    setState({
      id: (data as any)?.resend_domain_id,
      domain: (data as any)?.resend_sending_domain || null,
      status: (data as any)?.resend_domain_status || null,
      verifiedAt: (data as any)?.resend_domain_verified_at || null,
      lastCheckedAt: (data as any)?.resend_last_checked_at || null,
      records: Array.isArray((data as any)?.resend_dns_records)
        ? (data as any).resend_dns_records
        : [],
    });
    setLoading(false);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

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
          // Surface a confirm-style retry option in the UI.
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

  const verify = async () => {
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/resend/verify-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || `Verify failed (HTTP ${res.status}).`);
        return;
      }
      await reload();
      if (body.status === "verified") {
        toast({
          title: "Verified",
          description: `Emails will now go out from ${body.domain}.`,
        });
        if (body.newly_verified && onVerified) onVerified(body.domain);
      } else if (body.status === "pending") {
        toast({
          title: "Still pending",
          description:
            "DNS records can take a while to propagate. Re-check in a few minutes.",
        });
      } else {
        toast({
          title: `Status: ${body.status}`,
          description: "Check the DNS records and retry.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setVerifying(false);
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
    if (s === "pending") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
          <Loader2 className="w-3 h-3 animate-spin" /> Pending
        </span>
      );
    }
    if (s === "failed") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
          <AlertTriangle className="w-3 h-3" /> Failed
        </span>
      );
    }
    return null;
  }, [state.status]);

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

  // Domain registered -- show status + records.
  return (
    <div className="space-y-3">
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
                Last checked {new Date(state.lastCheckedAt).toLocaleString("en-ZA")}
              </p>
            )}
          </div>
        </div>
        {statusBadge}
      </div>

      {state.status !== "verified" && state.records.length > 0 && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Add these DNS records at your domain host (cPanel, Cloudflare, Domains.co.za, etc.)
            then click <strong>Verify now</strong>.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white border-b border-slate-200">
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Name / Host</th>
                  <th className="px-3 py-2 font-semibold">Value</th>
                  <th className="px-3 py-2 font-semibold">TTL</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
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
                      <div className="flex items-start gap-1">
                        <span className="flex-1">
                          {r.priority != null ? `${r.priority} ` : ""}
                          {r.value}
                        </span>
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
                    <td className="px-3 py-2 text-slate-600">{r.status || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {state.status === "verified" && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            DNS verified. Outgoing emails for this company will be sent from
            <strong className="ml-1">@{state.domain}</strong> with proper DKIM + SPF.
          </span>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={resetting}
          className="text-xs text-slate-500 hover:text-red-600 underline-offset-2 hover:underline inline-flex items-center gap-1"
        >
          {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
          Reset domain
        </button>
        {state.status !== "verified" && (
          <Button onClick={verify} disabled={verifying} size="sm" className="gap-2">
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            I've added them, verify now
          </Button>
        )}
      </div>
    </div>
  );
}
