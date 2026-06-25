/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Magic-link landing page for repeat customers. URL pattern:
 *
 *   /c/account?t=acc_xxxxx
 *
 * Shows every order this client has ever placed with the catering
 * company. Same branding, same privacy guarantees as /c/order/[id]
 * but scope='client' (keyed on lower-cased email).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, MapPin, Users, AlertTriangle, Loader2, ChefHat, ArrowRight,
  ShieldCheck, Mail, Phone, Globe,
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Footer } from "@/components/Footer";
import { toLocalISO } from "@/lib/localDate";

type AccountView = {
  ok: true;
  orders: any[];
  company: any;
  token: { expires_at: string; client_email: string };
};

const STATUS_TONES: Record<string, string> = {
  pending:    "bg-amber-100 text-amber-800 border-amber-200",
  confirmed:  "bg-blue-100 text-blue-800 border-blue-200",
  preparing:  "bg-purple-100 text-purple-800 border-purple-200",
  ready:      "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
  in_transit: "bg-indigo-100 text-indigo-800 border-indigo-200",
  delivered:  "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
  completed:  "bg-slate-100 text-slate-800 border-slate-200",
  cancelled:  "bg-rose-100 text-rose-700 border-rose-200",
};

export default function ClientAccountPage() {
  const router = useRouter();
  const queryToken = router.query.t as string | undefined;
  // Set by the tenant rewrite (/{slug}/c/account -> /c/account?company_slug=).
  // Passed to the API so the session cookie is scoped to the slug path.
  const companySlug = router.query.company_slug as string | undefined;

  const [view, setView] = useState<AccountView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!router.isReady) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/client-tokens/account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: queryToken || undefined, slug: companySlug || undefined }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "Invalid link");
        if (cancelled) return;
        setView(data as AccountView);
        if (queryToken) {
          // Strip token from URL after successful set-cookie, preserving
          // the slug so branding + the cookie path stay consistent.
          const stripped = companySlug
            ? `/c/account?company_slug=${encodeURIComponent(companySlug)}`
            : "/c/account";
          router.replace(stripped, undefined, { shallow: true });
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load your bookings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, queryToken]);

  const primary   = view?.company?.primary_color   || "#9333ea";
  const secondary = view?.company?.secondary_color || "#ec4899";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !view) {
    return (
      <>
        <NoIndexMeta />
        <Head><title>Bookings - CateringMS</title></Head>
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <Card className="max-w-md w-full border-0 shadow-lg">
            <CardContent className="pt-8 pb-6 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 mb-2">This link can't be opened</h1>
              <p className="text-sm text-slate-600">
                {error === "expired" ? "The link has expired." :
                 error === "revoked" ? "Your catering company has revoked this link." :
                 "We couldn't verify this access link. Ask the catering company for a fresh one."}
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const { orders, company } = view;
  // Wave 18 audit: hardcoded ZAR rendered "R5,000" for non-ZA tenants on
  // the magic-link account page. Resolve from the company row.
  const fmtMoney = (() => {
    const code = (company as any)?.currency || "ZAR";
    try {
      return new Intl.NumberFormat("en-ZA", { style: "currency", currency: code, maximumFractionDigits: 0 });
    } catch {
      return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
    }
  })();
  const upcoming = orders.filter((o: any) => o.event_date >= toLocalISO(new Date()) && o.status !== "cancelled");
  const past     = orders.filter((o: any) => !upcoming.includes(o));

  return (
    <>
      <NoIndexMeta />
      <Head><title>{`Your bookings - ${company.company_name}`}</title></Head>

      <div
        className="min-h-screen"
        style={{ background: `linear-gradient(135deg, ${primary}08 0%, ${secondary}08 100%)` }}
      >
        <div
          className="px-4 py-6 text-white shadow-lg"
          style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}
        >
          <div className="max-w-3xl mx-auto flex items-center gap-4">
            {company.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt={company.company_name} className="w-12 h-12 rounded-lg bg-white/90 object-contain p-1" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center">
                <ChefHat className="w-6 h-6 text-white" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wide text-white/70">Your bookings with</p>
              <h1 className="text-xl sm:text-2xl font-bold truncate">{company.company_name}</h1>
              <p className="text-xs text-white/80 mt-0.5">Signed in as {view.token.client_email}</p>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-white/80">
              <ShieldCheck className="w-4 h-4" />
              <span>Private link</span>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

          {upcoming.length > 0 && (
            <Section title="Coming up" count={upcoming.length} accent={primary}>
              {upcoming.map((o: any) => <OrderRow key={o.id} order={o} primary={primary} fmtMoney={fmtMoney} />)}
            </Section>
          )}

          {past.length > 0 && (
            <Section title="Past bookings" count={past.length} accent={primary}>
              {past.map((o: any) => <OrderRow key={o.id} order={o} primary={primary} fmtMoney={fmtMoney} muted />)}
            </Section>
          )}

          {orders.length === 0 && (
            <Card className="border-0 shadow-lg">
              <CardContent className="py-12 text-center">
                <Calendar className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <p className="text-slate-700 font-semibold">No bookings on file yet</p>
                <p className="text-sm text-slate-500 mt-1">Once you book your first event, it'll appear here.</p>
              </CardContent>
            </Card>
          )}

          <Card className="border-0 shadow-lg">
            <CardContent className="py-4 space-y-2 text-sm">
              <p className="font-semibold text-slate-900">Get in touch with {company.company_name}</p>
              {company.email && (
                <a href={`mailto:${company.email}`} className="flex items-center gap-2 text-slate-700 hover:text-slate-900">
                  <Mail className="w-4 h-4" style={{ color: primary }} /> {company.email}
                </a>
              )}
              {company.phone && (
                <a href={`tel:${company.phone}`} className="flex items-center gap-2 text-slate-700 hover:text-slate-900">
                  <Phone className="w-4 h-4" style={{ color: primary }} /> {company.phone}
                </a>
              )}
              {company.website && (
                <a href={company.website} target="_blank" rel="noopener" className="flex items-center gap-2 text-slate-700 hover:text-slate-900">
                  <Globe className="w-4 h-4" style={{ color: primary }} /> {company.website}
                </a>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-slate-400">
            This is a private link to bookings made with {view.token.client_email}. Don't share publicly.
          </p>
        </div>

        <Footer />
      </div>
    </>
  );
}

function Section({ title, count, accent, children }: any) {
  return (
    <div>
      <h2 className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2 px-1 flex items-center gap-2">
        {title}
        <span className="px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: `${accent}20`, color: accent }}>
          {count}
        </span>
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function OrderRow({ order, primary, fmtMoney, muted }: any) {
  const tone = STATUS_TONES[String(order.status || "").toLowerCase()] || STATUS_TONES.confirmed;
  return (
    <Link href={`/c/order/${order.id}`} className="block">
      <Card className={`border-0 shadow hover:shadow-lg transition-all ${muted ? "opacity-80" : ""}`}>
        <CardContent className="py-4 px-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-semibold text-slate-900 truncate">{order.event_name || order.order_number}</h3>
                <Badge variant="outline" className={`${tone} border text-[10px] capitalize`}>
                  {String(order.status).replace("_", " ")}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" /> {order.guest_count} guests
                </span>
                {order.venue_address && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="w-3 h-3" />
                    <span className="truncate">{order.venue_address}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="font-bold tabular-nums" style={{ color: primary }}>
                {fmtMoney.format(Number(order.total_amount || 0))}
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
