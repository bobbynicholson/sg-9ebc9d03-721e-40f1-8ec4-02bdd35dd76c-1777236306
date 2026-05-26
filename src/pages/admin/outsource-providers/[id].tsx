/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/outsource-providers/[id] - Wave 67.4.
 *
 * Per-provider history + performance page. Mirrors the /admin/suppliers/[id]
 * shape but with outsource-specific metrics: accept rate, average
 * response time, decline reasons, last 10 jobs, total billed vs paid.
 *
 * Drives the "who's the best fit for this booking" question when admin
 * has multiple candidate providers for the same menu item.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  Mail,
  MessageCircle,
  Phone,
  Star,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  HardHat,
  ExternalLink,
  Loader2,
} from "lucide-react";
import {
  type OutsourceProvider,
  COMMON_ROLES,
  RATE_TYPE_OPTIONS,
} from "@/services/outsourceProviderService";

interface AssignmentRow {
  id: string;
  order_id: string;
  status: string;
  requested_at: string;
  responded_at: string | null;
  decline_reason: string | null;
  required_on_site_at: string | null;
  service_description: string;
  quoted_cost: number;
  actual_cost: number | null;
  cost_currency: string;
  rate_type: string;
  invoice_received: boolean;
  invoice_paid: boolean;
  manually_marked_accepted: boolean;
  orders: {
    order_number: string | null;
    event_date: string | null;
    client_name: string | null;
  } | null;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function fmtMoney(n: number, currency = "ZAR"): string {
  try {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}

const STATUS_TONE: Record<string, string> = {
  requested: "bg-amber-50 text-amber-800 border-amber-200",
  accepted: "bg-blue-50 text-blue-800 border-blue-200",
  declined: "bg-rose-50 text-rose-800 border-rose-200",
  en_route: "bg-blue-50 text-blue-800 border-blue-200",
  on_site: "bg-blue-50 text-blue-800 border-blue-200",
  completed: "bg-green-50 text-green-800 border-green-200",
  cancelled: "bg-slate-50 text-slate-600 border-slate-200",
};

function ProviderDetail() {
  const router = useRouter();
  const providerId = typeof router.query.id === "string" ? router.query.id : null;
  const { profile } = useAuth() as { profile: { company_id?: string; role?: string; active_role?: string } | null };
  // OUT-B: finance-vis gate. Same rule as the list page.
  const financeRole = String(profile?.active_role || profile?.role || "").toLowerCase();
  const canSeeFinance =
    financeRole === "owner" || financeRole === "company_admin" ||
    financeRole === "admin" || financeRole === "super_admin";
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const companyId = (profile as any)?.company_id as string | undefined;

  const [provider, setProvider] = useState<OutsourceProvider | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!providerId || !companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [providerRes, assignmentsRes] = await Promise.all([
          (supabase as any)
            .from("outsource_providers")
            .select("*")
            .eq("id", providerId)
            .eq("company_id", companyId)
            .maybeSingle(),
          (supabase as any)
            .from("outsource_assignments")
            .select(`
              id, order_id, status, requested_at, responded_at, decline_reason,
              required_on_site_at, service_description, quoted_cost, actual_cost,
              cost_currency, rate_type, invoice_received, invoice_paid,
              manually_marked_accepted,
              orders:order_id (order_number, event_date, client_name)
            `)
            .eq("provider_id", providerId)
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .order("requested_at", { ascending: false })
            .limit(50),
        ]);
        if (!cancelled) {
          setProvider((providerRes?.data as OutsourceProvider | null) || null);
          setAssignments(((assignmentsRes?.data as AssignmentRow[]) || []));
        }
      } catch (e: any) {
        if (!cancelled) toast({ title: "Could not load", description: e?.message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [providerId, companyId, toast]);

  // Performance roll-up across the full assignment history.
  const stats = useMemo(() => {
    const total = assignments.length;
    const accepted = assignments.filter((a) => ["accepted", "en_route", "on_site", "completed"].includes(a.status)).length;
    const declined = assignments.filter((a) => a.status === "declined").length;
    const cancelled = assignments.filter((a) => a.status === "cancelled").length;
    const completed = assignments.filter((a) => a.status === "completed").length;
    const respondedCount = assignments.filter((a) => !!a.responded_at && !a.manually_marked_accepted).length;
    const manualAccepts = assignments.filter((a) => a.manually_marked_accepted).length;
    const decided = accepted + declined;
    const acceptRate = decided > 0 ? Math.round((accepted / decided) * 100) : null;
    const avgResponseMinutes = (() => {
      const responded = assignments.filter((a) => a.responded_at && !a.manually_marked_accepted);
      if (responded.length === 0) return null;
      const totalMs = responded.reduce((sum, a) => {
        const reqMs = new Date(a.requested_at).getTime();
        const resMs = new Date(a.responded_at!).getTime();
        if (!Number.isFinite(reqMs) || !Number.isFinite(resMs) || resMs < reqMs) return sum;
        return sum + (resMs - reqMs);
      }, 0);
      return Math.round(totalMs / responded.length / 60_000);
    })();
    const totalBilled = assignments
      .filter((a) => a.status !== "cancelled" && a.status !== "declined")
      .reduce((sum, a) => sum + Number(a.actual_cost ?? a.quoted_cost ?? 0), 0);
    const totalPaid = assignments
      .filter((a) => a.invoice_paid)
      .reduce((sum, a) => sum + Number(a.actual_cost ?? a.quoted_cost ?? 0), 0);
    const outstanding = totalBilled - totalPaid;
    return { total, accepted, declined, cancelled, completed, acceptRate, avgResponseMinutes, totalBilled, totalPaid, outstanding, respondedCount, manualAccepts };
  }, [assignments]);

  const declineReasons = useMemo(() => {
    return assignments
      .filter((a) => a.status === "declined" && a.decline_reason)
      .slice(0, 5)
      .map((a) => ({ id: a.id, reason: a.decline_reason as string, when: a.responded_at }));
  }, [assignments]);

  const roleLabel = (value: string) =>
    COMMON_ROLES.find((r) => r.value === value)?.label || value.replace(/_/g, " ");
  const rateLabel = provider
    ? (RATE_TYPE_OPTIONS.find((r) => r.value === provider.default_rate_type)?.label || provider.default_rate_type)
    : "";

  return (
    <>
      <NoIndexMeta />
      <Head><title>{provider?.provider_name || "Provider"} | CateringMS</title></Head>
      <AdminNav />
      <div className="min-h-screen bg-slate-50 lg:pl-72 xl:pl-80">
        {/* Wave 70.6 - mobile pass. pt-20 clears the mobile
            AdminNav top bar (lg: nav is the left sidebar so pt-6 is
            enough). max-w-5xl with mx-auto centres on big screens. */}
        <div className="pt-20 lg:pt-6 px-3 sm:px-4 pb-8 max-w-5xl mx-auto">
          <Link
            href={withSlug("/admin/outsource-providers")}
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Back to outsource providers
          </Link>

          {loading ? (
            <Card><CardContent className="p-12 text-center text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading...
            </CardContent></Card>
          ) : !provider ? (
            <Card><CardContent className="p-12 text-center text-slate-500">
              Provider not found.
            </CardContent></Card>
          ) : (
            <>
              {/* Header. On mobile the rate tile stacks below the
                  title block and right-aligns. md+ they sit side by
                  side. */}
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
                    <HardHat className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 shrink-0" />
                    <span className="break-words">{provider.provider_name}</span>
                  </h1>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {!provider.is_active && (
                      <Badge className="bg-slate-200 text-slate-700">Inactive</Badge>
                    )}
                    {provider.rating != null && (
                      <span className="inline-flex items-center gap-0.5 text-sm text-amber-700">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        {Number(provider.rating).toFixed(1)} / 5
                      </span>
                    )}
                    {(provider.provider_roles || []).map((r) => (
                      <Badge key={r} variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                        {roleLabel(r)}
                      </Badge>
                    ))}
                    {/* OUT-C: insurance expiry chip. Amber within 30
                        days, rose when expired. Hidden when no expiry
                        date on file. */}
                    {(() => {
                      const pp = provider as typeof provider & { insurance_expiry?: string | null };
                      if (!pp.insurance_expiry) return null;
                      const days = Math.floor((new Date(pp.insurance_expiry).getTime() - Date.now()) / 86_400_000);
                      if (days >= 30) {
                        return (
                          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                            Insured · expires in {days}d
                          </Badge>
                        );
                      }
                      if (days >= 0) {
                        return (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            Insurance expires in {days}d
                          </Badge>
                        );
                      }
                      return (
                        <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">
                          Insurance expired {-days}d ago
                        </Badge>
                      );
                    })()}
                  </div>
                  {provider.specialty && (
                    <p className="text-sm text-slate-600 mt-1">{provider.specialty}</p>
                  )}
                  {provider.contact_person && (
                    <p className="text-sm text-slate-700 mt-1">Contact: {provider.contact_person}</p>
                  )}
                  {/* Mobile-friendly tap targets: min-h on the pills
                      so they're comfortably tappable on touch. Email
                      truncates long addresses with break-all. */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {provider.email && (
                      <a href={`mailto:${provider.email}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 min-h-[34px] hover:bg-slate-50 max-w-full">
                        <Mail className="w-3 h-3 shrink-0" /> <span className="break-all">{provider.email}</span>
                      </a>
                    )}
                    {provider.whatsapp_number && (
                      <a href={`https://wa.me/${provider.whatsapp_number.replace(/[^\d]/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-green-800 bg-green-50 border border-green-200 rounded-md px-2.5 py-1.5 min-h-[34px] hover:bg-green-100">
                        <MessageCircle className="w-3 h-3 shrink-0" /> {provider.whatsapp_number}
                      </a>
                    )}
                    {provider.phone && (
                      <a href={`tel:${provider.phone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 min-h-[34px] hover:bg-slate-50">
                        <Phone className="w-3 h-3 shrink-0" /> {provider.phone}
                      </a>
                    )}
                  </div>
                </div>
                {canSeeFinance && (
                  <div className="text-left md:text-right shrink-0 md:pl-4 md:border-l md:border-slate-200">
                    {provider.default_rate != null && (
                      <>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Default rate</p>
                        <p className="text-lg font-bold text-slate-900 tabular-nums">
                          {fmtMoney(Number(provider.default_rate), provider.default_currency)}
                        </p>
                        <p className="text-[11px] text-slate-500">{rateLabel.toLowerCase()}</p>
                      </>
                    )}
                    {provider.payment_terms_days != null && (
                      <p className="text-[11px] text-slate-500 mt-1">Pay Net {provider.payment_terms_days} days</p>
                    )}
                  </div>
                )}
              </div>

              {/* Performance stats. 2-up on mobile, 4-up md+. p-3 on
                  mobile so the long money values don't overflow. */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    <p className="text-xs text-slate-600 mb-1">Accept rate</p>
                    <p className={`text-xl sm:text-2xl font-bold tabular-nums ${stats.acceptRate == null ? "text-slate-500" : stats.acceptRate >= 80 ? "text-emerald-700" : stats.acceptRate >= 50 ? "text-amber-700" : "text-rose-700"}`}>
                      {stats.acceptRate == null ? "-" : `${stats.acceptRate}%`}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      {stats.accepted} accepted / {stats.declined} declined
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    <p className="text-xs text-slate-600 mb-1">Avg response</p>
                    <p className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
                      {stats.avgResponseMinutes == null
                        ? "-"
                        : stats.avgResponseMinutes < 60
                          ? `${stats.avgResponseMinutes}m`
                          : stats.avgResponseMinutes < 1440
                            ? `${Math.round(stats.avgResponseMinutes / 60)}h`
                            : `${Math.round(stats.avgResponseMinutes / 1440)}d`}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      across {stats.respondedCount} magic-link reply{stats.respondedCount === 1 ? "" : "s"}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    <p className="text-xs text-slate-600 mb-1">Completed jobs</p>
                    <p className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">{stats.completed}</p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      of {stats.total} request{stats.total === 1 ? "" : "s"}
                    </p>
                  </CardContent>
                </Card>
                {canSeeFinance ? (
                  <Card>
                    <CardContent className="p-3 sm:p-4">
                      <p className="text-xs text-slate-600 mb-1">Total billed</p>
                      <p className="text-base sm:text-lg font-bold text-slate-900 tabular-nums break-words">
                        {fmtMoney(stats.totalBilled, provider.default_currency)}
                      </p>
                      {stats.outstanding > 0 && (
                        <p className="text-[10px] text-amber-700 mt-1 tabular-nums">
                          {fmtMoney(stats.outstanding, provider.default_currency)} outstanding
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-3 sm:p-4">
                      <p className="text-xs text-slate-600 mb-1">Accepted jobs</p>
                      <p className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">{stats.accepted}</p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        of {stats.total} request{stats.total === 1 ? "" : "s"}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* OUT-C: Compliance card - VAT + insurance + certs.
                  Only renders when at least one field is populated;
                  noise-free for tenants that don't track this. */}
              {(() => {
                const pp = provider as typeof provider & {
                  vat_number?: string | null;
                  insurance_provider?: string | null;
                  insurance_policy_number?: string | null;
                  insurance_expiry?: string | null;
                  certification_notes?: string | null;
                };
                const hasAny = pp.vat_number || pp.insurance_provider || pp.insurance_policy_number || pp.insurance_expiry || pp.certification_notes;
                if (!hasAny) return null;
                return (
                  <Card className="mb-6">
                    <CardContent className="p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
                        Compliance
                      </p>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {pp.vat_number && (
                          <div>
                            <dt className="text-xs text-slate-500">VAT number</dt>
                            <dd className="text-slate-900">{pp.vat_number}</dd>
                          </div>
                        )}
                        {pp.insurance_provider && (
                          <div>
                            <dt className="text-xs text-slate-500">Insurance provider</dt>
                            <dd className="text-slate-900">{pp.insurance_provider}</dd>
                          </div>
                        )}
                        {pp.insurance_policy_number && (
                          <div>
                            <dt className="text-xs text-slate-500">Policy number</dt>
                            <dd className="text-slate-900">{pp.insurance_policy_number}</dd>
                          </div>
                        )}
                        {pp.insurance_expiry && (
                          <div>
                            <dt className="text-xs text-slate-500">Expires</dt>
                            <dd className="text-slate-900">{new Date(pp.insurance_expiry).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</dd>
                          </div>
                        )}
                        {pp.certification_notes && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-slate-500">Certifications</dt>
                            <dd className="text-slate-700 whitespace-pre-wrap">{pp.certification_notes}</dd>
                          </div>
                        )}
                      </dl>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Decline reasons */}
              {declineReasons.length > 0 && (
                <Card className="mb-6 border-rose-200 bg-rose-50/30">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-rose-700 font-semibold mb-2 inline-flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> Recent decline reasons
                    </p>
                    <ul className="space-y-1.5 text-sm text-slate-700">
                      {declineReasons.map((d) => (
                        <li key={d.id} className="flex items-start justify-between gap-3">
                          <span className="italic">&ldquo;{d.reason}&rdquo;</span>
                          <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">{fmtDateTime(d.when)}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Assignment history */}
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Recent jobs
                </h2>
                <p className="text-xs text-slate-500">{assignments.length} on file</p>
              </div>

              {assignments.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-slate-500 text-sm">
                  No bookings on file for this provider yet. Attach them to an order from the order modal &rarr; Outsourced fulfilment panel.
                </CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {assignments.slice(0, 10).map((a) => {
                    const tone = STATUS_TONE[a.status] || STATUS_TONE.cancelled;
                    const orderNumber = a.orders?.order_number || a.order_id.slice(0, 8);
                    const clientName = a.orders?.client_name || "Unknown client";
                    const eventDate = a.orders?.event_date;
                    const cost = Number(a.actual_cost ?? a.quoted_cost ?? 0);
                    return (
                      <Card key={a.id} className="hover:shadow-sm transition">
                        <CardContent className="p-3">
                          {/* Mobile: cost stacks under the info block.
                              sm+: cost floats right. Avoids the cost
                              column getting cramped on phones. */}
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link
                                  href={withSlug(`/order/${a.order_id}`)}
                                  className="font-semibold text-slate-900 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
                                >
                                  {orderNumber} <ExternalLink className="w-3 h-3" />
                                </Link>
                                <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-semibold ${tone}`}>
                                  {a.status.replace(/_/g, " ")}
                                </span>
                                {a.invoice_paid && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700">
                                    <CheckCircle2 className="w-2.5 h-2.5" /> Paid
                                  </span>
                                )}
                                {a.manually_marked_accepted && (
                                  <span className="text-[10px] text-slate-500" title="Admin marked accepted on the provider's behalf">
                                    (manual)
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 mt-0.5 break-words">{clientName} {eventDate ? `· ${fmtDate(eventDate)}` : ""}</p>
                              <p className="text-xs text-slate-700 mt-1 break-words">{a.service_description}</p>
                              {a.decline_reason && (
                                <p className="text-[11px] text-rose-700 italic mt-1 break-words">&ldquo;{a.decline_reason}&rdquo;</p>
                              )}
                            </div>
                            <div className="text-left sm:text-right shrink-0 flex flex-wrap sm:block items-baseline gap-x-3 sm:gap-x-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                              <p className="text-sm font-semibold text-slate-900 tabular-nums">{fmtMoney(cost, a.cost_currency)}</p>
                              <p className="text-[10px] text-slate-500">{a.rate_type.replace(/_/g, " ")}</p>
                              <p className="text-[10px] text-slate-500 sm:mt-1 tabular-nums">
                                requested {fmtDate(a.requested_at)}
                              </p>
                              {a.responded_at && (
                                <p className="text-[10px] text-slate-500 tabular-nums">
                                  responded {fmtDate(a.responded_at)}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {assignments.length > 10 && (
                    <p className="text-xs text-slate-500 text-center mt-2">
                      Showing 10 of {assignments.length} on file.
                    </p>
                  )}
                </div>
              )}

              {/* Notes block at the bottom */}
              {provider.notes && (
                <Card className="mt-6">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1.5">Notes</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{provider.notes}</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function ProtectedProviderDetailPage() {
  return (
    // OUT-A (OUT-2): match index role set.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <ProviderDetail />
    </ProtectedRoute>
  );
}
