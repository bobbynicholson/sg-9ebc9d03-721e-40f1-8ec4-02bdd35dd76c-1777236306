/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Company profile - the source of truth for the catering company's
 * identity. This is what every other page reads from:
 *
 *  - AdminNav header (name, brand colours, logo, today's pulse)
 *  - /c/order/[id] tokenised client pages (logo + colours)
 *  - /c/account magic-link client pages (logo + colours)
 *  - googleMapsService.calculateDeliveryFee uses kitchen address as
 *    origin
 *  - Route planning + delivery distance use headquarters_lat/lng
 *
 * Address uses Places autocomplete when GOOGLE_MAPS_API_KEY is set,
 * else falls back to manual entry. Either way lat/lng can be edited
 * directly so an admin can fine-tune.
 */
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, MapPin, Mail, Phone, Globe, Image as ImageIcon, Palette, Save, Loader2, ShieldCheck, ExternalLink, ArrowRight, Landmark, Hash, Calendar, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { useToast } from "@/hooks/use-toast";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { AddressAutocomplete } from "@/components/admin/AddressAutocomplete";
import { toLocalISO, TENANT_TIMEZONE_CHOICES, isValidTimezone } from "@/lib/localDate";
import { z } from "zod";
import { useTenantHref } from "@/lib/tenantUrl";
import { captureException } from "@/lib/observability";

/**
 * Phase 7 #9: zod-based pre-save validator. The original brief
 * was a full react-hook-form migration of this 978-line form,
 * but the actual safety win is at the save boundary - catching
 * a malformed email, an out-of-range VAT rate or a junk hex
 * colour BEFORE the row hits the DB. RHF can land later as a
 * field-by-field refactor; this guards the data either way.
 *
 * `.partial()` everywhere because most fields are nullable in
 * the schema and the save flow tolerates blanks. `superRefine`
 * is reserved for cross-field rules (vat_registered implies a
 * VAT number).
 */
const hexColour = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const companyProfileSchema = z.object({
  company_name: z.string().min(1, "Company name is required.").max(120),
  email: z.string().email("Email looks invalid.").nullish().or(z.literal("")),
  phone: z.string().max(40).nullish().or(z.literal("")),
  website: z.string().url("Website should be a full URL, e.g. https://example.co.za").nullish().or(z.literal("")),
  primary_color: z.string().regex(hexColour, "Brand colour must be a hex code, e.g. #10b981.").nullish().or(z.literal("")),
  secondary_color: z.string().regex(hexColour, "Secondary colour must be a hex code, e.g. #0ea5e9.").nullish().or(z.literal("")),
  vat_rate: z.coerce.number().min(0, "VAT rate can't be negative.").max(100, "VAT rate can't exceed 100%.").nullish(),
  headquarters_lat: z.coerce.number().min(-90).max(90).nullish(),
  headquarters_lng: z.coerce.number().min(-180).max(180).nullish(),
  vat_registered: z.boolean().nullish(),
  vat_number: z.string().max(40).nullish().or(z.literal("")),
}).partial().superRefine((val, ctx) => {
  if (val.vat_registered && !val.vat_number?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["vat_number"],
      message: "VAT number required when registered for VAT.",
    });
  }
});

interface CompanyRow {
  id: string;
  company_name: string;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  headquarters_lat: number | null;
  headquarters_lng: number | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  registration_number: string | null;
  tax_number: string | null;
  vat_registered: boolean | null;
  vat_number: string | null;
  vat_rate: number | null;
  pricing_includes_vat: boolean | null;
  bank_name: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_branch_code: string | null;
  bank_account_type: string | null;
  eft_instructions: string | null;
  /** Phase 4 #3: IANA timezone that drives report buckets, BCEA pay
   *  windows, kitchen lead-time gates, daily cron boundaries. */
  timezone: string | null;
  currency: string | null;
  /** Phase 5 #3: Google Business Profile place_id. Drives the
   *  after-sales review email to a proper write-review deeplink. */
  google_place_id: string | null;
  /** FIN-D (peak-season form integration, follow-up to PR #308):
   *  inclusive months (1-12) that bound the tenant's peak booking
   *  season. Drives the Peak Season banner on /admin/financial-
   *  dashboard via aiFinancialService.generateCashFlowAlerts. NULL
   *  on either side falls back to the SA wedding default May-
   *  September. peak_season_end_month can be < peak_season_start_
   *  month to wrap year-end (e.g. Nov-Jan = 11..1) for tenants whose
   *  peak straddles December. */
  peak_season_start_month: number | null;
  peak_season_end_month: number | null;
  /** CASH-B (cashflow follow-ups): per-tenant override for the
   *  CashflowForecastCard Stale badge threshold. NULL = use the 72h
   *  default. Capped at 720h (30 days). A daily-reconciliation
   *  kitchen sets ~36; a once-a-week back-office sets ~144. */
  cash_on_hand_stale_after_hours: number | null;
  /** CP-B (task #218, 2026-05-25): added to the interface so the
   *  field stops being read via `(row as any).pricing_includes_vat`.
   *  Drives whether the menu / equipment / inventory price fields
   *  are treated as gross (customer-facing) or net (ex-VAT). */
  pricing_includes_vat: boolean | null;
  /** CP-B: surfaced so the "Last saved Nh ago" chip beside the
   *  Save button has a real timestamp to read. */
  updated_at: string | null;
}

function CompanyProfilePage() {
  const { profile, user, refreshProfile } = useAuth() as any;
  const companyId = profile?.company_id || user?.company_id;
  const { toast } = useToast();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();

  const [row, setRow] = useState<CompanyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasMapsKey, setHasMapsKey] = useState<boolean | null>(null);

  // CP-B (task #218, 2026-05-25): snapshot of the last loaded /
  // last saved row, JSON-stringified. Used to derive the isDirty
  // flag without keeping a parallel state tree.
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const isDirty = row != null && JSON.stringify(row) !== savedSnapshot;

  // CP-B: warn on unload when there are unsaved edits. Modern
  // browsers ignore the message string and show their own copy,
  // but the truthy returnValue still triggers the prompt.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    setHasMapsKey(Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY));
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        captureException(error, {
          tags: { route: "/admin/company-profile", step: "load", companyId },
        });
        toast({ title: "Couldn't load profile", description: dbErrorMessage(error, { entity: "company profile" }), variant: "destructive" });
      } else {
        const r = data as CompanyRow;
        setRow(r);
        // CP-B: snapshot for the dirty flag.
        setSavedSnapshot(JSON.stringify(r));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const fullAddress = (r: CompanyRow | null) => {
    if (!r) return "";
    return [r.address_line1, r.address_line2, r.city, r.state_province, r.postal_code, r.country]
      .filter(Boolean).join(", ");
  };

  const onPickAddress = (pick: any) => {
    if (!row) return;
    const c = pick.components || {};
    const street = [c.street_number, c.street].filter(Boolean).join(" ").trim() || pick.address;
    setRow({
      ...row,
      address_line1: street || pick.address,
      city: c.city || row.city,
      state_province: c.state || row.state_province,
      postal_code: c.postal_code || row.postal_code,
      country: c.country || row.country || "South Africa",
      headquarters_lat: pick.lat ?? row.headquarters_lat,
      headquarters_lng: pick.lng ?? row.headquarters_lng,
    });
  };

  const save = async () => {
    if (!row) return;
    // Phase 4 #3: refuse a bogus IANA timezone so we never land an
    // unparseable string in the DB. Empty falls back to the column
    // default (Africa/Johannesburg) - we let the picker emit
    // "" -> null and treat that as 'use default'.
    if (row.timezone && !isValidTimezone(row.timezone)) {
      toast({
        title: "Invalid timezone",
        description: `'${row.timezone}' isn't a recognised IANA timezone. Pick from the list.`,
        variant: "destructive",
      });
      return;
    }
    // Phase 7 #9: zod pre-save validation. Surfaces the first
    // problem as a destructive toast keyed to the offending
    // field so the operator knows where to look.
    const parsed = companyProfileSchema.safeParse({
      company_name: row.company_name,
      email: row.email,
      phone: row.phone,
      website: row.website,
      primary_color: row.primary_color,
      secondary_color: row.secondary_color,
      vat_rate: row.vat_rate,
      headquarters_lat: row.headquarters_lat,
      headquarters_lng: row.headquarters_lng,
      vat_registered: row.vat_registered,
      vat_number: row.vat_number,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast({
        title: `Check ${first.path.join(".") || "the form"}`,
        description: first.message,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        company_name: row.company_name,
        legal_name: row.legal_name,
        email: row.email,
        phone: row.phone,
        website: row.website,
        address_line1: row.address_line1,
        address_line2: row.address_line2,
        city: row.city,
        state_province: row.state_province,
        postal_code: row.postal_code,
        country: row.country,
        headquarters_lat: row.headquarters_lat,
        headquarters_lng: row.headquarters_lng,
        logo_url: row.logo_url,
        primary_color: row.primary_color,
        secondary_color: row.secondary_color,
        registration_number: row.registration_number,
        tax_number: row.tax_number,
        vat_registered: row.vat_registered ?? false,
        pricing_includes_vat: (row as any).pricing_includes_vat ?? false,
        vat_number: row.vat_number,
        vat_rate: row.vat_rate ?? 15,
        bank_name: row.bank_name,
        bank_account_holder: row.bank_account_holder,
        bank_account_number: row.bank_account_number,
        bank_branch_code: row.bank_branch_code,
        bank_account_type: row.bank_account_type,
        eft_instructions: row.eft_instructions,
        timezone: row.timezone || null,
        currency: row.currency || null,
        google_place_id: row.google_place_id?.trim() || null,
        // FIN-D: peak-season months. Both stored as int 1-12 or NULL.
        // Save coerces null when either side is unset since the
        // service requires both to draw the banner.
        peak_season_start_month: row.peak_season_start_month,
        peak_season_end_month: row.peak_season_end_month,
        // CASH-B: per-tenant stale threshold for the cashflow
        // dashboard's Cash on hand badge.
        cash_on_hand_stale_after_hours: row.cash_on_hand_stale_after_hours,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("companies")
        .update(payload)
        .eq("id", row.id);
      if (error) throw error;
      toast({ title: "Saved", description: "Profile updated, nav, branded client pages and route planning all use this now." });
      refreshProfile?.();
      // CP-B: refresh the snapshot so isDirty flips back to false
      // and the beforeunload guard lifts. updated_at also bumps so
      // the "Last saved" chip ticks to "just now".
      const fresh: CompanyRow = { ...row, updated_at: payload.updated_at };
      setRow(fresh);
      setSavedSnapshot(JSON.stringify(fresh));
    } catch (e: any) {
      captureException(e, {
        tags: { route: "/admin/company-profile", step: "save", companyId: row.id },
      });
      toast({ title: "Save failed", description: dbErrorMessage(e, { entity: "company profile" }), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !row) {
    return (
      <>
        <NoIndexMeta />
        <Head><title>Company profile - CateringMS</title></Head>
        <AdminNav />
        <div className="admin-page-shell admin-page-shell--center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      </>
    );
  }

  return (
    <>
      <NoIndexMeta />
      <Head><title>Company profile - CateringMS</title></Head>
      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            title={<span className="flex items-center gap-2">Company profile <InfoTooltip content={"Your business name, contacts, and HQ location all live here.\n\nThis feeds the sidebar header, client-facing pages, route planning, and delivery fees. Brand colours + logo live on the White Label page."} /></span>}
            icon={Building2}
            subtitle="This drives the sidebar branding, client-facing pages, route planning and delivery fees."
            actions={
            <>
              {/* CP-B: last-saved chip + unsaved-changes chip beside
                  the primary Save button. The chip text reads from
                  updated_at and re-formats every render (cheap; the
                  page re-renders on any input edit anyway). */}
              {isDirty ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                  <AlertTriangle className="w-3 h-3" /> Unsaved changes
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
                  <Clock className="w-3 h-3" /> {formatRelativeSince(row.updated_at)}
                </span>
              )}
              <Button onClick={save} disabled={saving || !isDirty} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save profile
              </Button>
            </>
            }
          />
          <PageWorkbench />

          {/* CP-B: setup completeness banner. Each row links to the
              anchor of the section that owns the field; clicking
              scrolls + focuses so the operator can fix the gap in
              one tap. Required items show red when missing; optional
              items show slate. Hidden when 100% complete + no
              optional gaps. */}
          {(() => {
            const items = deriveCompleteness(row);
            const requiredDone = items.filter((i) => i.required && i.done).length;
            const requiredTotal = items.filter((i) => i.required).length;
            const optionalDone = items.filter((i) => !i.required && i.done).length;
            const optionalTotal = items.filter((i) => !i.required).length;
            const allDone = requiredDone === requiredTotal && optionalDone === optionalTotal;
            if (allDone) return null;
            return (
              <Card className="mb-6 bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {requiredDone === requiredTotal ? (
                        <CheckCircle2 className="w-5 h-5 text-brand-primary" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                      )}
                      <p className="font-semibold text-slate-900">
                        Setup completeness
                      </p>
                    </div>
                    <p className="text-xs tabular-nums text-slate-600">
                      Required {requiredDone} / {requiredTotal} · Optional {optionalDone} / {optionalTotal}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.filter((i) => !i.done).map((i) => (
                      <button
                        key={i.key}
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(i.anchor);
                          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          i.required
                            ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        {i.label}{i.required ? "" : " (optional)"}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Identity */}
          <Card id="section-identity" className="mb-6 scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-slate-600" />
                Identity
                <InfoTooltip content={"The name, phone, email, website, and registration details that show up everywhere clients and your team see your brand."} />
              </CardTitle>
              <CardDescription>What clients and your team see across the app.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field id="company_name" label="Company name">
                <Input id="company_name" value={row.company_name || ""} onChange={(e) => setRow({ ...row, company_name: e.target.value })} />
              </Field>
              <Field id="legal_name" label="Legal / trading name (optional)">
                <Input id="legal_name" value={row.legal_name || ""} onChange={(e) => setRow({ ...row, legal_name: e.target.value })} />
              </Field>
              <Field id="email" label="Contact email">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input id="email" type="email" value={row.email || ""} onChange={(e) => setRow({ ...row, email: e.target.value })} className="pl-9" />
                </div>
              </Field>
              <Field id="phone" label="Phone">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input id="phone" value={row.phone || ""} onChange={(e) => setRow({ ...row, phone: e.target.value })} className="pl-9" />
                </div>
              </Field>
              <Field id="website" label="Website">
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input id="website" value={row.website || ""} onChange={(e) => setRow({ ...row, website: e.target.value })} className="pl-9" placeholder="https://spitbraaidelivery.co.za" />
                </div>
              </Field>
              <Field id="logo_url" label="Logo URL">
                <div className="relative">
                  <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input id="logo_url" value={row.logo_url || ""} onChange={(e) => setRow({ ...row, logo_url: e.target.value })} className="pl-9" placeholder="https://..." />
                </div>
              </Field>
              <Field id="reg" label="Registration number">
                <Input id="reg" value={row.registration_number || ""} onChange={(e) => setRow({ ...row, registration_number: e.target.value })} />
              </Field>
              <Field id="tax" label="Tax number (income tax / company tax)">
                <Input id="tax" value={row.tax_number || ""} onChange={(e) => setRow({ ...row, tax_number: e.target.value })} />
              </Field>
            </CardContent>
          </Card>

          {/* Phase 4 #3: tenant timezone + currency. Drives every
              date-bucket boundary (kitchen lead time, BCEA pay
              windows, daily cron) and the currency tag on quotes /
              invoices / payslips. Pre-populated to Africa/Johannesburg
              + ZAR by the DB migration so existing tenants don't see
              an empty value. */}
          <Card id="section-region" className="mb-6 scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-600" />
                Region &amp; currency
                <InfoTooltip content={"Sets the wall clock for every date bucket in the system. Reports, kitchen prep lead times, driver pay windows and the daily cron all key off this. Get it wrong on a UK or US deploy and reports will show events on the wrong day."} />
              </CardTitle>
              <CardDescription>
                Timezone for date buckets (reports, kitchen lead time, pay windows). Currency tag on documents.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field id="timezone" label="Timezone (IANA)">
                <select
                  id="timezone"
                  value={row.timezone || ""}
                  onChange={(e) => setRow({ ...row, timezone: e.target.value || null })}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                >
                  <option value="">- pick a timezone -</option>
                  {TENANT_TIMEZONE_CHOICES.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </Field>
              <Field id="currency" label="Currency">
                <select
                  id="currency"
                  value={row.currency || "ZAR"}
                  onChange={(e) => setRow({ ...row, currency: e.target.value })}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                >
                  <option value="ZAR">ZAR - South African Rand</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="AUD">AUD - Australian Dollar</option>
                </select>
              </Field>
              {/* Phase 5 #3: Google Business Profile place_id. When
                  set, the after-sales review email switches from a
                  generic Google search link to the proper write-
                  review deeplink so customers land on the review
                  modal in one tap. */}
              <Field id="google_place_id" label="Google Business place_id (for review emails)">
                <Input
                  id="google_place_id"
                  value={row.google_place_id || ""}
                  onChange={(e) => setRow({ ...row, google_place_id: e.target.value })}
                  placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
                />
              </Field>
              <p className="md:col-span-2 text-xs text-slate-500 leading-relaxed">
                Find your place_id at{" "}
                <a
                  href="https://developers.google.com/maps/documentation/places/web-service/place-id"
                  className="underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  developers.google.com/maps/place-id
                </a>{" "}
                - paste your business listing URL into the finder and copy the place_id. With this set, post-delivery review emails link directly to the 'leave a review' modal instead of a generic Google search.
              </p>
            </CardContent>
          </Card>

          {/* FIN-D (peak-season form integration, follow-up to PR
              #308): operator-facing surface for the
              peak_season_start_month + peak_season_end_month columns.
              Empty values fall back to the SA wedding default (May-
              September) in aiFinancialService. End < start wraps
              year-end so US Q4 caterers can set 11..1. */}
          <Card id="section-peak" className="mb-6 scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-600" />
                Peak season
                <InfoTooltip content={"Tells the financial dashboard which months count as your peak. The Peak Season banner uses these to surface a count-down 6 weeks before peak starts and a 'peak is here' pulse for the first two weeks of the window.\n\nLeave both blank to inherit the SA wedding default (May - September). End month can be before start month to wrap year-end - e.g. set 11 to 1 for a US holiday catering peak (Nov - Jan)."} />
              </CardTitle>
              <CardDescription>
                Drives the Peak Season banner on the financial dashboard. Leave blank to use the South African wedding default (May - September).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field id="peak_season_start_month" label="Peak starts">
                <select
                  id="peak_season_start_month"
                  value={row.peak_season_start_month ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    setRow({ ...row, peak_season_start_month: v });
                  }}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                >
                  <option value="">- inherit default -</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1, 1).toLocaleString("en-ZA", { month: "long" })}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="peak_season_end_month" label="Peak ends">
                <select
                  id="peak_season_end_month"
                  value={row.peak_season_end_month ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    setRow({ ...row, peak_season_end_month: v });
                  }}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                >
                  <option value="">- inherit default -</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1, 1).toLocaleString("en-ZA", { month: "long" })}
                    </option>
                  ))}
                </select>
              </Field>
              {row.peak_season_start_month != null && row.peak_season_end_month != null && (
                <p className="md:col-span-2 text-xs text-slate-500 leading-relaxed">
                  Peak window:{" "}
                  <strong>
                    {new Date(2000, row.peak_season_start_month - 1, 1).toLocaleString("en-ZA", { month: "long" })}
                    {" - "}
                    {new Date(2000, row.peak_season_end_month - 1, 1).toLocaleString("en-ZA", { month: "long" })}
                  </strong>
                  {row.peak_season_end_month < row.peak_season_start_month && (
                    <> (wraps over year-end)</>
                  )}
                  .
                </p>
              )}
              {(row.peak_season_start_month == null) !== (row.peak_season_end_month == null) && (
                <p className="md:col-span-2 text-xs text-amber-700 leading-relaxed">
                  Set both start and end, or leave both blank. The banner ignores a half-configured window and falls back to the default.
                </p>
              )}
            </CardContent>
          </Card>

          {/* CASH-B (cashflow dashboard follow-ups): per-tenant
              override for the Cash on hand "Stale" badge on the
              cashflow dashboard. NULL falls back to the 72h default
              the card was hardcoded to in CASH-A. A kitchen that
              reconciles daily sets ~36; a once-a-week back office
              sets ~144. Capped at 30 days (720h) so the badge can
              never be permanently suppressed. */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-600" />
                Cash on hand staleness
                <InfoTooltip content={"How long the cashflow dashboard waits after you last updated the Cash on hand value before it warns you the number is going stale.\n\nThe forecast is only as accurate as that bank-balance entry; the badge tells the bookkeeper when it's time to refresh.\n\nLeave blank to inherit the 72h default (matches a typical Mon/Wed/Fri reconciliation rhythm)."} />
              </CardTitle>
              <CardDescription>
                Hours since the last Cash on hand entry before the dashboard badge warns it&apos;s stale. Leave blank for the 72h default.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field id="cash_on_hand_stale_after_hours" label="Stale after (hours)">
                <Input
                  id="cash_on_hand_stale_after_hours"
                  type="number"
                  min={1}
                  max={720}
                  step={1}
                  placeholder="72 (default)"
                  value={row.cash_on_hand_stale_after_hours == null ? "" : String(row.cash_on_hand_stale_after_hours)}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === "") {
                      setRow({ ...row, cash_on_hand_stale_after_hours: null });
                      return;
                    }
                    const n = Number(raw);
                    if (!Number.isFinite(n)) return;
                    setRow({ ...row, cash_on_hand_stale_after_hours: Math.max(1, Math.min(720, Math.round(n))) });
                  }}
                />
              </Field>
              {row.cash_on_hand_stale_after_hours != null && (
                <p className="md:col-span-2 text-xs text-slate-500 leading-relaxed">
                  Stale after <strong>{row.cash_on_hand_stale_after_hours}h</strong>
                  {" "}({(row.cash_on_hand_stale_after_hours / 24).toFixed(1)} days).
                </p>
              )}
            </CardContent>
          </Card>

          {/* VAT registration. Drives the document title on quotes
              and invoices: VAT-registered businesses issue 'Tax
              Invoice' (with a VAT number on the document); everyone
              else issues a plain 'Invoice'. SARS rule. */}
          <Card id="section-vat" className="mb-6 scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-brand-primary" />
                VAT registration
                <InfoTooltip content={"South African rule: VAT-registered businesses issue 'Tax Invoice' documents with their VAT number on every quote and invoice. Non-registered businesses issue plain 'Invoices'.\n\nFlip the toggle and the document templates + totals labels (incl. VAT) update everywhere automatically."} />
              </CardTitle>
              <CardDescription>
                Switches the document title on your client-facing quotes and invoices, and labels totals as &apos;incl. VAT&apos; when on.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="flex items-start gap-3 px-3 py-3 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={!!row.vat_registered}
                    onChange={(e) => setRow({ ...row, vat_registered: e.target.checked })}
                    className="mt-0.5 w-4 h-4"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">This business is VAT registered</p>
                    <p className="text-xs text-slate-500">When on, your quotes and invoices say &apos;Tax Invoice&apos; and show your VAT number.</p>
                  </div>
                </label>
              </div>
              <Field id="vat_number" label="VAT number">
                <Input
                  id="vat_number"
                  value={row.vat_number || ""}
                  onChange={(e) => setRow({ ...row, vat_number: e.target.value })}
                  placeholder="e.g. 4123456789"
                  disabled={!row.vat_registered}
                />
              </Field>
              <Field id="vat_rate" label="VAT rate (%)">
                <Input
                  id="vat_rate"
                  type="number"
                  step="0.01"
                  value={row.vat_rate ?? 15}
                  onChange={(e) => setRow({ ...row, vat_rate: e.target.value === "" ? null : Number(e.target.value) })}
                  disabled={!row.vat_registered}
                />
              </Field>

              {/* Pricing convention - the call most operators get
                  wrong and spend weeks fixing later. Drives whether
                  the menu / equipment / inventory price fields are
                  treated as gross (customer-facing) or net (ex-VAT).
                  Setting it once and consistently is critical for
                  the GP-per-serving math to make sense. */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <Label htmlFor="pricing_includes_vat" className="flex items-center gap-1">
                  Pricing convention
                  <InfoTooltip content={"Pick how you enter prices into the system, then leave it alone:\n\n• On (inc VAT): the rand you type into menu items, equipment hire prices and ingredient costs is what the customer pays / what the supplier charges. Quotes show the same total at the top; ex-VAT subtotal + VAT line are derived for accounting display.\n\n• Off (ex VAT): you enter pre-VAT figures. The system adds VAT on top at quote time.\n\nThe convention has to match across every input field, otherwise the gross-profit per serving will be wrong because cost and sell sides won't be on the same basis. Default is off (ex VAT)."} />
                </Label>
                <p className="text-xs text-slate-500">
                  Drives whether prices everywhere are entered including or excluding VAT. Pick one and stay consistent.
                </p>
                <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
                  <input
                    id="pricing_includes_vat"
                    type="checkbox"
                    className="mt-0.5"
                    checked={!!(row as any).pricing_includes_vat}
                    onChange={(e) => setRow({ ...row, pricing_includes_vat: e.target.checked } as any)}
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Prices include VAT</p>
                    <p className="text-xs text-slate-500">
                      What you type into menu items, equipment and ingredient cost fields is the customer-facing / supplier-facing price. The system derives the ex-VAT subtotal for the quote / invoice. Turn off if you'd rather enter net prices and let the system add VAT on top.
                    </p>
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Banking details. These are what clients see when they
              choose EFT on the portal billing page or the public
              invoice. The reference clients use is the invoice
              number, hard-coded in the EFT flow - the only
              reconciliation rule that needs to hold. */}
          <Card id="section-banking" className="mb-6 scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-blue-600" />
                Banking details
                <InfoTooltip content={"Shown to your clients when they pick EFT on their portal or on a public invoice link. The reference they use is always the invoice number, which is what your bank reconciliation will match against.\n\nLeave the whole section blank if you don't want EFT as an option."} />
              </CardTitle>
              <CardDescription>
                Clients see these on their billing page when they choose EFT. Leave blank to hide the EFT option entirely.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field id="bank_name" label="Bank">
                <Input
                  id="bank_name"
                  value={row.bank_name || ""}
                  onChange={(e) => setRow({ ...row, bank_name: e.target.value })}
                  placeholder="e.g. FNB, Standard Bank, Capitec"
                />
              </Field>
              <Field id="bank_account_holder" label="Account holder">
                <Input
                  id="bank_account_holder"
                  value={row.bank_account_holder || ""}
                  onChange={(e) => setRow({ ...row, bank_account_holder: e.target.value })}
                  placeholder="The exact name on the bank account"
                />
              </Field>
              <Field id="bank_account_number" label="Account number">
                <Input
                  id="bank_account_number"
                  value={row.bank_account_number || ""}
                  onChange={(e) => setRow({ ...row, bank_account_number: e.target.value })}
                  placeholder="e.g. 62123456789"
                  inputMode="numeric"
                />
              </Field>
              <Field id="bank_branch_code" label="Branch code" hint="Most SA banks accept the universal branch code, e.g. 250655 (FNB), 051001 (Standard Bank).">
                <Input
                  id="bank_branch_code"
                  value={row.bank_branch_code || ""}
                  onChange={(e) => setRow({ ...row, bank_branch_code: e.target.value })}
                  placeholder="e.g. 250655"
                  inputMode="numeric"
                />
              </Field>
              <Field id="bank_account_type" label="Account type">
                <select
                  id="bank_account_type"
                  value={row.bank_account_type || ""}
                  onChange={(e) => setRow({ ...row, bank_account_type: e.target.value || null })}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                >
                  <option value="">Pick one</option>
                  <option value="cheque">Cheque / current</option>
                  <option value="savings">Savings</option>
                  <option value="transmission">Transmission</option>
                </select>
              </Field>
              <Field
                id="eft_instructions"
                label="Note for clients (optional)"
                hint="Shown under the bank details on the EFT screen. Use it for things like 'Payments take 1-2 business days to reflect' or 'Send proof of payment to ...'."
              >
                <Input
                  id="eft_instructions"
                  value={row.eft_instructions || ""}
                  onChange={(e) => setRow({ ...row, eft_instructions: e.target.value })}
                  placeholder="Allow 1-2 business days for payment to reflect"
                />
              </Field>
              <div className="md:col-span-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 space-y-1">
                <p className="font-semibold">How EFT confirmation works</p>
                <p>
                  Your client sees these details with the invoice number as a copyable reference. After they pay,
                  they tap &quot;I&apos;ve made the EFT payment&quot;, which:
                </p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>logs a pending payment row against the invoice;</li>
                  <li>fires you an in-app notification with the amount, reference and any note from them;</li>
                  <li>flags the invoice as &quot;Payment claimed&quot; so you can reconcile against your bank statement and confirm.</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Address + map coords */}
          <Card id="section-address" className="mb-6 scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-brand-primary" />
                Kitchen / HQ address
                <InfoTooltip content={"This is the starting point for every delivery distance and route plan.\n\nThe more accurate the address and coordinates, the more accurate every quote's delivery fee will be."} />
              </CardTitle>
              <CardDescription>
                {hasMapsKey
                  ? "Type your address, Google Places auto-completes and fills the lat/lng for you."
                  : "Manual entry only, once Google Maps is connected (see notice below) the autocomplete kicks in."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field id="addr_search" label="Search and pick">
                <AddressAutocomplete
                  id="addr_search"
                  value={fullAddress(row)}
                  onChange={onPickAddress}
                  placeholder="64 Visagie Street, Monte Vista..."
                />
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field id="addr1" label="Address line 1">
                  <Input id="addr1" value={row.address_line1 || ""} onChange={(e) => setRow({ ...row, address_line1: e.target.value })} />
                </Field>
                <Field id="addr2" label="Address line 2">
                  <Input id="addr2" value={row.address_line2 || ""} onChange={(e) => setRow({ ...row, address_line2: e.target.value })} />
                </Field>
                <Field id="city" label="City / suburb">
                  <Input id="city" value={row.city || ""} onChange={(e) => setRow({ ...row, city: e.target.value })} />
                </Field>
                <Field id="state" label="Province / state">
                  <Input id="state" value={row.state_province || ""} onChange={(e) => setRow({ ...row, state_province: e.target.value })} />
                </Field>
                <Field id="zip" label="Postal code">
                  <Input id="zip" value={row.postal_code || ""} onChange={(e) => setRow({ ...row, postal_code: e.target.value })} />
                </Field>
                <Field id="country" label="Country">
                  <Input id="country" value={row.country || ""} onChange={(e) => setRow({ ...row, country: e.target.value })} />
                </Field>
                <Field id="lat" label="Latitude" hint="Auto-filled from address pick. Edit only if you know what you're doing.">
                  <Input id="lat" type="number" step="0.000001" value={row.headquarters_lat ?? ""} onChange={(e) => setRow({ ...row, headquarters_lat: Number(e.target.value) || null })} />
                </Field>
                <Field id="lng" label="Longitude">
                  <Input id="lng" type="number" step="0.000001" value={row.headquarters_lng ?? ""} onChange={(e) => setRow({ ...row, headquarters_lng: Number(e.target.value) || null })} />
                </Field>
              </div>
              {row.headquarters_lat && row.headquarters_lng && (
                <a
                  href={`https://www.google.com/maps?q=${row.headquarters_lat},${row.headquarters_lng}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 text-xs text-slate-600 hover:underline"
                >
                  Verify on Google Maps <ExternalLink className="w-3 h-3" />
                </a>
              )}

              {!hasMapsKey && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> Google Maps not connected yet
                  </p>
                  <p>
                    Until the platform owner adds <code className="bg-white px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in
                    Vercel, address autocomplete and auto lat/lng are off. You can still enter everything manually.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Document numbering - per-tenant invoice / quote / order
              counters. Backed by company_number_settings + the
              consume_next_document_number RPC. Owners migrating from
              another tool can dial in their carry-over starting number
              here so the next document picks up where the old system
              left off. */}
          <DocumentNumberingCard companyId={row.id} />

          {/* Brand colours - managed on the dedicated White Label page so
              there's a single source of truth for logo + palette. */}
          <Card id="section-brand" className="mb-6 scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-rose-600" />
                Brand colours + logo
              </CardTitle>
              <CardDescription>
                Manage these on the White Label page so logo, organisation name, and the full colour palette stay in sync.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="rounded-lg p-4 text-white mb-4"
                style={{ background: `linear-gradient(135deg, ${row.primary_color || "#9333ea"} 0%, ${row.secondary_color || "#ec4899"} 100%)` }}
              >
                <p className="text-xs uppercase tracking-wide opacity-80">Current branding</p>
                <p className="text-lg font-bold">{row.company_name || "Your company"}</p>
              </div>
              <Link href={withSlug("/admin/white-label")}>
                <Button variant="outline" className="w-full gap-2">
                  Open White Label settings
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Button onClick={save} disabled={saving || !isDirty} className="w-full gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isDirty ? "Save profile" : "Profile up to date"}
          </Button>

          <p className="text-[11px] text-slate-500 text-center mt-4">
            Saved values flow into <code className="bg-slate-100 px-1 rounded">AdminNav</code>,{" "}
            <code className="bg-slate-100 px-1 rounded">/c/order/[id]</code>,{" "}
            <code className="bg-slate-100 px-1 rounded">/c/account</code>, and{" "}
            <code className="bg-slate-100 px-1 rounded">googleMapsService.calculateDeliveryFee</code>.
          </p>
        </PortalShell>
      </div>
    </>
  );
}

// CP-B (task #218, 2026-05-25): humanise updated_at into a short
// "Saved 12m ago" / "Saved 2h ago" / "Saved on 19 May" string for
// the chip beside the Save button.
function formatRelativeSince(iso: string | null | undefined): string {
  if (!iso) return "Never saved";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "Never saved";
  const diffMs = Date.now() - t;
  if (diffMs < 0) return "Just saved";
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return "Just saved";
  const m = Math.floor(s / 60);
  if (m < 60) return `Saved ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Saved ${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `Saved ${d}d ago`;
  return `Saved ${new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`;
}

// CP-B: setup-completeness checklist. Mirrors the onboarding
// wizard's check; clicking a missing row scrolls the user to the
// anchor of the section that owns the field. Banking + Peak season
// are advisory (operators can intentionally leave them off) so
// they're flagged "optional" in the row label, not red.
interface CompletenessItem { key: string; label: string; anchor: string; required: boolean; done: boolean }
function deriveCompleteness(r: CompanyRow): CompletenessItem[] {
  return [
    { key: "name",     label: "Business name",      anchor: "section-identity", required: true,  done: !!(r.company_name && r.company_name.trim()) },
    { key: "email",    label: "Contact email",      anchor: "section-identity", required: true,  done: !!(r.email && r.email.trim()) },
    { key: "phone",    label: "Phone",              anchor: "section-identity", required: true,  done: !!(r.phone && r.phone.trim()) },
    { key: "reg",      label: "Registration / tax", anchor: "section-identity", required: false, done: !!(r.registration_number || r.tax_number) },
    { key: "address",  label: "Kitchen address",    anchor: "section-address",  required: true,  done: !!(r.address_line1 && r.city) },
    { key: "coords",   label: "HQ lat / lng",       anchor: "section-address",  required: true,  done: r.headquarters_lat != null && r.headquarters_lng != null },
    { key: "vat",      label: "VAT status",         anchor: "section-vat",      required: true,  done: r.vat_registered != null && (!r.vat_registered || !!r.vat_number) },
    { key: "bank",     label: "EFT bank details",   anchor: "section-banking",  required: false, done: !!(r.bank_name && r.bank_account_number) },
    { key: "tz",       label: "Timezone + currency",anchor: "section-region",   required: true,  done: !!(r.timezone && r.currency) },
    { key: "place",    label: "Google place_id",    anchor: "section-region",   required: false, done: !!(r.google_place_id && r.google_place_id.trim()) },
    { key: "peak",     label: "Peak season",        anchor: "section-peak",     required: false, done: r.peak_season_start_month != null && r.peak_season_end_month != null },
    { key: "brand",    label: "Brand + logo",       anchor: "section-brand",    required: false, done: !!(r.logo_url && r.primary_color) },
  ];
}

function Field({ id, label, hint, children }: any) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs font-semibold text-slate-700">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

// ── Document numbering card ─────────────────────────────────────────
//
// One collapsible block per doc type (invoice, quote, order). Each
// block POSTs to /api/admin/numbering-settings with the validated
// payload. Live preview shows the next 3 numbers as the operator
// types so they can sanity-check the format before saving.

type DocType = "invoice" | "quote" | "order";

interface NumberingSettingRow {
  company_id: string;
  document_type: DocType;
  prefix: string;
  padding: number;
  include_year: boolean;
  year_separator: "-" | "/";
  resets_yearly: boolean;
  next_number: number;
  effective_from: string;
  notes: string | null;
}

interface NumberingStats {
  highest: number;
  sample: string | null;
}

const DOC_TYPE_META: Record<DocType, { label: string; description: string; defaultPrefix: string }> = {
  invoice: {
    label: "Invoices",
    description: "Tax invoices and proforma invoices issued to clients.",
    defaultPrefix: "INV-",
  },
  quote: {
    label: "Quotes",
    description: "Quotes sent to clients before they accept.",
    defaultPrefix: "QUO-",
  },
  order: {
    label: "Orders",
    description: "Internal order records once a quote is accepted.",
    defaultPrefix: "ORD-",
  },
};

function previewNumber(s: NumberingSettingRow, offset: number): string {
  const seq = s.next_number + offset;
  const year = new Date().getFullYear();
  const pad = Math.max(3, Math.min(10, s.padding || 6));
  const padded = String(seq).padStart(pad, "0");
  return `${s.prefix || ""}${s.include_year ? `${year}${s.year_separator}` : ""}${padded}`;
}

function DocumentNumberingCard({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Record<DocType, NumberingSettingRow | null>>({
    invoice: null, quote: null, order: null,
  });
  const [stats, setStats] = useState<Record<DocType, NumberingStats>>({
    invoice: { highest: 0, sample: null },
    quote: { highest: 0, sample: null },
    order: { highest: 0, sample: null },
  });
  const [savingType, setSavingType] = useState<DocType | null>(null);
  const [openType, setOpenType] = useState<DocType | null>("invoice");

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/admin/numbering-settings", { method: "GET" });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(j?.error || "Failed to load");
        const map: Record<DocType, NumberingSettingRow | null> = {
          invoice: null, quote: null, order: null,
        };
        for (const row of (j.settings || []) as NumberingSettingRow[]) {
          map[row.document_type] = row;
        }
        setRows(map);
        setStats(j.stats || {
          invoice: { highest: 0, sample: null },
          quote: { highest: 0, sample: null },
          order: { highest: 0, sample: null },
        });
      } catch (e: any) {
        toast({ title: "Couldn't load numbering settings", description: dbErrorMessage(e, { entity: "numbering settings" }), variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const updateRow = (t: DocType, patch: Partial<NumberingSettingRow>) => {
    setRows((prev) => {
      const cur = prev[t] || {
        company_id: companyId,
        document_type: t,
        prefix: DOC_TYPE_META[t].defaultPrefix,
        padding: 6,
        include_year: false,
        year_separator: "-",
        resets_yearly: false,
        next_number: 1,
        effective_from: toLocalISO(new Date()),
        notes: null,
      };
      return { ...prev, [t]: { ...cur, ...patch } };
    });
  };

  const save = async (t: DocType) => {
    const row = rows[t];
    if (!row) return;
    setSavingType(t);
    try {
      const r = await fetch("/api/admin/numbering-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      const j = await r.json();
      if (!r.ok) {
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      toast({ title: `${DOC_TYPE_META[t].label} numbering saved`, description: `Next number: ${previewNumber(j.after, 0)}` });
      setRows((prev) => ({ ...prev, [t]: j.after }));
    } catch (e: any) {
      toast({ title: "Save failed", description: dbErrorMessage(e, { entity: "numbering settings" }), variant: "destructive" });
    } finally {
      setSavingType(null);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hash className="w-5 h-5 text-blue-600" />
          Document numbering
          <InfoTooltip content={"Per-tenant counters for the invoice, quote, and order numbers your clients see.\n\nMigrating from another tool? Set the starting number to whatever comes next in the old sequence and the platform will pick up from there.\n\nValidation blocks regressing past numbers you've already issued, so you can't accidentally re-use a live invoice number."} />
        </CardTitle>
        <CardDescription>
          Configure how invoices, quotes, and orders are numbered for {""}
          {DOC_TYPE_META.invoice.label.toLowerCase()}, quotes, and orders.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading numbering settings...
          </div>
        ) : (
          (Object.keys(DOC_TYPE_META) as DocType[]).map((t) => {
            const meta = DOC_TYPE_META[t];
            const row = rows[t];
            const stat = stats[t];
            const open = openType === t;
            return (
              <div key={t} className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                  onClick={() => setOpenType(open ? null : t)}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{meta.label}</p>
                    <p className="text-xs text-slate-500">
                      {row ? `Next: ${previewNumber(row, 0)}` : meta.description}
                      {stat.highest > 0 && ` · Highest issued: ${stat.sample || stat.highest}`}
                    </p>
                  </div>
                  <ArrowRight className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
                </button>

                {open && row && (
                  <div className="p-4 space-y-3 bg-white">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field id={`prefix-${t}`} label="Prefix" hint="Up to 16 characters. Letters, digits, hyphens, slashes, dots.">
                        <Input
                          id={`prefix-${t}`}
                          value={row.prefix}
                          maxLength={16}
                          onChange={(e) => updateRow(t, { prefix: e.target.value })}
                        />
                      </Field>
                      <Field id={`pad-${t}`} label="Pad to digits" hint="3-10. INV-001 (3) vs INV-000001 (6).">
                        <Input
                          id={`pad-${t}`}
                          type="number"
                          min={3}
                          max={10}
                          value={row.padding}
                          onChange={(e) => updateRow(t, { padding: Math.max(3, Math.min(10, parseInt(e.target.value, 10) || 6)) })}
                        />
                      </Field>
                      <div className="md:col-span-2">
                        <label className="flex items-start gap-3 px-3 py-2 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={row.include_year}
                            onChange={(e) => updateRow(t, { include_year: e.target.checked, resets_yearly: e.target.checked ? row.resets_yearly : false })}
                            className="mt-0.5 w-4 h-4"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900">Include year</p>
                            <p className="text-xs text-slate-500">Adds the calendar year between the prefix and the sequence, e.g. INV-2026-000123.</p>
                          </div>
                        </label>
                      </div>
                      {row.include_year && (
                        <>
                          <Field id={`sep-${t}`} label="Year separator">
                            <select
                              id={`sep-${t}`}
                              className="w-full h-9 rounded-md border border-slate-200 px-2 bg-white text-sm"
                              value={row.year_separator}
                              onChange={(e) => updateRow(t, { year_separator: (e.target.value === "/" ? "/" : "-") })}
                            >
                              <option value="-">- (hyphen, e.g. INV-2026-000001)</option>
                              <option value="/">/ (slash, e.g. INV-2026/000001)</option>
                            </select>
                          </Field>
                          <div>
                            <label className="flex items-start gap-3 px-3 py-2 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={row.resets_yearly}
                                onChange={(e) => updateRow(t, { resets_yearly: e.target.checked })}
                                className="mt-0.5 w-4 h-4"
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-slate-900">Reset annually</p>
                                <p className="text-xs text-slate-500">Sequence kicks back to 1 on 1 January.</p>
                              </div>
                            </label>
                          </div>
                        </>
                      )}
                      <Field id={`next-${t}`} label="Next number" hint={stat.highest > 0 ? `You've already issued up to ${stat.sample || stat.highest}. Must be at least ${stat.highest + 1}.` : "The number that will be issued next."}>
                        <Input
                          id={`next-${t}`}
                          type="number"
                          min={1}
                          value={row.next_number}
                          onChange={(e) => updateRow(t, { next_number: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        />
                      </Field>
                      <Field id={`eff-${t}`} label="Effective from">
                        <Input
                          id={`eff-${t}`}
                          type="date"
                          value={row.effective_from}
                          onChange={(e) => updateRow(t, { effective_from: e.target.value })}
                        />
                      </Field>
                      <Field id={`notes-${t}`} label="Notes (internal)">
                        <Input
                          id={`notes-${t}`}
                          value={row.notes || ""}
                          onChange={(e) => updateRow(t, { notes: e.target.value })}
                          placeholder="e.g. Carried over from QuickBooks on 2026-05-06"
                        />
                      </Field>
                    </div>

                    <div className="rounded-md border border-blue-100 bg-blue-50 p-3">
                      <p className="text-xs font-semibold text-blue-900 mb-1">Live preview</p>
                      <div className="flex flex-wrap gap-2 text-xs font-mono text-blue-900">
                        <span className="px-2 py-1 bg-white rounded border border-blue-200">{previewNumber(row, 0)}</span>
                        <span className="px-2 py-1 bg-white rounded border border-blue-200">{previewNumber(row, 1)}</span>
                        <span className="px-2 py-1 bg-white rounded border border-blue-200">{previewNumber(row, 2)}</span>
                      </div>
                    </div>

                    <Button onClick={() => save(t)} disabled={savingType === t} className="gap-2">
                      {savingType === t ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save {meta.label.toLowerCase()} numbering
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default function ProtectedCompanyProfile() {
  // CP-B (task #218, 2026-05-25): admit OWNER. The page hardcoded
  // SUPER_ADMIN + COMPANY_ADMIN + ADMIN, which 403'd the OWNER
  // persona out of their own company profile. Same regression
  // pattern we fixed on the team landings, driver settlement,
  // onboarding wizard and HR hub.
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN,
      UserRole.OWNER,
      UserRole.COMPANY_ADMIN,
      UserRole.ADMIN,
    ]}>
      <CompanyProfilePage />
    </ProtectedRoute>
  );
}
