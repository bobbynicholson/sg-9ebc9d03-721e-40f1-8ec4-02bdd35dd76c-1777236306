/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /p/accept/[token] - Wave 67 Phase D.
 *
 * Public magic-link page for outsource providers. They land here from
 * the request email or WhatsApp, see the order summary, and tap
 * Accept or Decline. No CateringMS account required.
 *
 * Same UX register as the client magic-link surfaces (/c/order/[id],
 * /pay/i/[token]): clean, minimal, mobile-first. Nothing tenant-
 * specific in the layout because providers might work with multiple
 * catering companies and we don't want to bombard them with brand.
 *
 * Token validation lives server-side in /api/outsource/accept/[token]
 * (GET = load, POST = respond). This page is the thin client.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Loader2, Calendar, MapPin, Users, Clock, AlertTriangle } from "lucide-react";

interface LoadResponse {
  ok: boolean;
  status?: string;
  providerName?: string | null;
  serviceDescription?: string;
  scopeNotes?: string | null;
  requiredOnSiteAt?: string | null;
  quotedCost?: number;
  costCurrency?: string;
  rateType?: string;
  order?: {
    order_number: string | null;
    event_date: string | null;
    event_time: string | null;
    client_name: string | null;
    venue_address: string | null;
    guest_count: number | null;
  } | null;
  error?: string;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("en-ZA", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  } catch { return iso; }
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
}

function fmtMoney(n: number | undefined, currency = "ZAR"): string {
  if (n == null) return "";
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}

function rateTypeLabel(rateType: string | undefined): string {
  switch (rateType) {
    case "per_hour": return "per hour";
    case "per_guest": return "per guest";
    case "quoted": return "quoted";
    default: return "for the event";
  }
}

export default function OutsourceAcceptPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : null;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LoadResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [declineMode, setDeclineMode] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const resp = await fetch(`/api/outsource/accept/${token}`);
        const json = (await resp.json()) as LoadResponse;
        if (!resp.ok) {
          setError(json.error || `Couldn't load (${resp.status})`);
        } else {
          setData(json);
          // If they've already responded, hop straight to the done state.
          if (json.status === "accepted" || json.status === "en_route" || json.status === "on_site" || json.status === "completed") {
            setDone("accepted");
          } else if (json.status === "declined") {
            setDone("declined");
          } else if (json.status === "cancelled") {
            setError("This booking was cancelled.");
          }
        }
      } catch (e: any) {
        setError(e?.message || "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const submit = async (decline: boolean) => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch(`/api/outsource/accept/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decline,
          declineReason: decline ? declineReason : undefined,
          noteFromProvider: note || undefined,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setError(json?.error || `Submit failed (${resp.status})`);
        return;
      }
      setDone(decline ? "declined" : "accepted");
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head><title>Booking request - CateringMS</title></Head>
      <main className="min-h-screen bg-slate-50 flex items-start justify-center py-8 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
            {/* Header band */}
            <div className="px-5 py-4 border-b border-slate-200">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                Booking request
              </p>
              <h1 className="text-xl font-bold text-slate-900 mt-0.5">
                {data?.providerName ? `Hi ${data.providerName}` : "Hello"}
              </h1>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4">
              {loading && (
                <div className="text-center text-slate-500 py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading...
                </div>
              )}

              {!loading && error && !done && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900 inline-flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {!loading && !error && done === "accepted" && (
                <div className="text-center py-6">
                  <CheckCircle2 className="w-12 h-12 text-brand-primary mx-auto mb-2" />
                  <h2 className="text-lg font-semibold text-slate-900">Confirmed - thank you</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    {data?.providerName ? `${data.providerName}, the company` : "The company"} will be in touch with final details closer to the date.
                  </p>
                  {data?.order?.event_date && (
                    <p className="text-xs text-slate-500 mt-3 tabular-nums">
                      Event: {fmtDate(data.order.event_date)}{data.order.event_time ? ` at ${fmtTime(data.order.event_time)}` : ""}
                    </p>
                  )}
                </div>
              )}

              {!loading && !error && done === "declined" && (
                <div className="text-center py-6">
                  <XCircle className="w-12 h-12 text-rose-600 mx-auto mb-2" />
                  <h2 className="text-lg font-semibold text-slate-900">Declined - noted</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    The company has been notified and will look for an alternative provider.
                  </p>
                </div>
              )}

              {!loading && !error && !done && data && (
                <>
                  {/* Event summary */}
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2">
                      <Calendar className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                      <div className="text-sm text-slate-900">
                        <span className="font-semibold">{fmtDate(data.order?.event_date)}</span>
                        {data.order?.event_time && (
                          <span className="text-slate-600"> at {fmtTime(data.order.event_time)}</span>
                        )}
                        {data.requiredOnSiteAt && (
                          <p className="text-xs text-slate-600 mt-0.5">
                            On site by {new Date(data.requiredOnSiteAt).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                      <p className="text-sm text-slate-900">{data.order?.venue_address || "Venue TBC"}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Users className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                      <p className="text-sm text-slate-900">
                        {data.order?.guest_count ?? "?"} guests
                        {data.order?.client_name && (
                          <span className="text-slate-600"> &middot; {data.order.client_name}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Scope */}
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">What we're asking</p>
                    <p className="text-sm text-slate-900 whitespace-pre-wrap leading-snug">
                      {data.serviceDescription}
                    </p>
                    {data.scopeNotes && (
                      <p className="text-xs text-slate-700 mt-2 whitespace-pre-wrap leading-snug">
                        {data.scopeNotes}
                      </p>
                    )}
                  </div>

                  {/* Cost */}
                  {data.quotedCost != null && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-baseline justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-blue-700 font-semibold">Agreed rate</p>
                        <p className="text-xs text-blue-700 mt-0.5">{rateTypeLabel(data.rateType)}</p>
                      </div>
                      <p className="text-lg font-bold text-blue-900 tabular-nums">
                        {fmtMoney(data.quotedCost, data.costCurrency)}
                      </p>
                    </div>
                  )}

                  {/* Note field */}
                  {!declineMode && (
                    <div>
                      <label className="text-xs text-slate-600">
                        Add a note <span className="text-slate-400">(optional)</span>
                      </label>
                      <Textarea
                        rows={2}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. I'll bring my own knives, arriving 30 min early..."
                        className="mt-1 text-sm"
                      />
                    </div>
                  )}

                  {/* Decline reason */}
                  {declineMode && (
                    <div>
                      <label className="text-xs text-slate-600">
                        Reason <span className="text-slate-400">(optional)</span>
                      </label>
                      <Textarea
                        rows={2}
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        placeholder="e.g. Already booked for another event, out of town..."
                        className="mt-1 text-sm"
                      />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    {!declineMode ? (
                      <>
                        <Button
                          onClick={() => submit(false)}
                          disabled={submitting}
                          className="flex-1 bg-brand-primary hover:bg-brand-primary/90"
                        >
                          {submitting ? "Sending..." : "Accept"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setDeclineMode(true)}
                          disabled={submitting}
                          className="text-rose-700 border-rose-200 hover:bg-rose-50"
                        >
                          Decline
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={() => submit(true)}
                          disabled={submitting}
                          className="flex-1 bg-rose-600 hover:bg-rose-700"
                        >
                          {submitting ? "Sending..." : "Confirm decline"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setDeclineMode(false)}
                          disabled={submitting}
                        >
                          Back
                        </Button>
                      </>
                    )}
                  </div>
                  {error && (
                    <p className="text-xs text-rose-700">{error}</p>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-2 text-[10px] text-slate-400">
              <Clock className="w-3 h-3" />
              <span>Magic-link request. No account needed. Powered by CateringMS.</span>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
