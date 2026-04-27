/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Company profile -- the source of truth for the catering company's
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2, MapPin, Mail, Phone, Globe, Image as ImageIcon, Palette,
  Save, Loader2, ShieldCheck, ExternalLink, Sparkles,
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { AddressAutocomplete } from "@/components/admin/AddressAutocomplete";

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
}

const PRESET_PALETTES = [
  { name: "Purple / Pink",  primary: "#9333ea", secondary: "#ec4899" },
  { name: "Amber / Orange", primary: "#f59e0b", secondary: "#ea580c" },
  { name: "Emerald / Teal", primary: "#10b981", secondary: "#14b8a6" },
  { name: "Blue / Indigo",  primary: "#3b82f6", secondary: "#6366f1" },
  { name: "Rose / Red",     primary: "#f43f5e", secondary: "#dc2626" },
  { name: "Slate",          primary: "#475569", secondary: "#1e293b" },
];

function CompanyProfilePage() {
  const { profile, user, refreshProfile } = useAuth() as any;
  const companyId = profile?.company_id || user?.company_id;
  const { toast } = useToast();

  const [row, setRow] = useState<CompanyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasMapsKey, setHasMapsKey] = useState<boolean | null>(null);

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
        toast({ title: "Couldn't load profile", description: error.message, variant: "destructive" });
      } else {
        setRow(data as CompanyRow);
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
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("companies")
        .update(payload)
        .eq("id", row.id);
      if (error) throw error;
      toast({ title: "Saved", description: "Profile updated -- nav, branded client pages and route planning all use this now." });
      refreshProfile?.();
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !row) {
    return (
      <>
        <NoIndexMeta />
        <Head><title>Company Profile - CateringMS Admin</title></Head>
        <AdminNav />
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-64 xl:pl-72 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      </>
    );
  }

  return (
    <>
      <NoIndexMeta />
      <Head><title>Company Profile - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-3 sm:px-4 md:px-6 py-6 max-w-screen-2xl">

          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${row.primary_color || "#9333ea"} 0%, ${row.secondary_color || "#ec4899"} 100%)` }}
              >
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold text-slate-900">Company profile</h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  This drives the sidebar branding, client-facing pages, route planning and delivery fees.
                </p>
              </div>
            </div>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save profile
            </Button>
          </div>

          {/* Identity */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-600" />
                Identity
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
              <Field id="tax" label="VAT / tax number">
                <Input id="tax" value={row.tax_number || ""} onChange={(e) => setRow({ ...row, tax_number: e.target.value })} />
              </Field>
            </CardContent>
          </Card>

          {/* Address + map coords */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-600" />
                Kitchen / HQ address
                <InfoTooltip content="Used as the origin for every delivery distance and route plan. The lat/lng below are what googleMapsService.calculateDeliveryFee uses -- so accuracy here makes every quote's delivery fee accurate." />
              </CardTitle>
              <CardDescription>
                {hasMapsKey
                  ? "Type your address -- Google Places auto-completes and fills the lat/lng for you."
                  : "Manual entry only -- once Google Maps is connected (see notice below) the autocomplete kicks in."}
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
                  className="inline-flex items-center gap-1 text-xs text-purple-600 hover:underline"
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

          {/* Branding colours */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-pink-600" />
                Brand colours
                <InfoTooltip content="These drive the sidebar gradient, the client-facing /c/order page header, the magic-link /c/account page, and any branded email we send. Pick a preset or paste your own hex." />
              </CardTitle>
              <CardDescription>Used everywhere we render your brand.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PRESET_PALETTES.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => setRow({ ...row, primary_color: p.primary, secondary_color: p.secondary })}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      row.primary_color === p.primary && row.secondary_color === p.secondary
                        ? "border-slate-900"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div
                      className="h-6 rounded mb-2"
                      style={{ background: `linear-gradient(135deg, ${p.primary} 0%, ${p.secondary} 100%)` }}
                    />
                    <p className="text-xs font-medium text-slate-900">{p.name}</p>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field id="primary" label="Primary hex">
                  <div className="flex items-center gap-2">
                    <input type="color" value={row.primary_color || "#9333ea"} onChange={(e) => setRow({ ...row, primary_color: e.target.value })} className="w-10 h-10 rounded border border-slate-200" />
                    <Input id="primary" value={row.primary_color || ""} onChange={(e) => setRow({ ...row, primary_color: e.target.value })} placeholder="#9333ea" />
                  </div>
                </Field>
                <Field id="secondary" label="Secondary hex">
                  <div className="flex items-center gap-2">
                    <input type="color" value={row.secondary_color || "#ec4899"} onChange={(e) => setRow({ ...row, secondary_color: e.target.value })} className="w-10 h-10 rounded border border-slate-200" />
                    <Input id="secondary" value={row.secondary_color || ""} onChange={(e) => setRow({ ...row, secondary_color: e.target.value })} placeholder="#ec4899" />
                  </div>
                </Field>
              </div>
              <div
                className="rounded-lg p-4 text-white"
                style={{ background: `linear-gradient(135deg, ${row.primary_color || "#9333ea"} 0%, ${row.secondary_color || "#ec4899"} 100%)` }}
              >
                <p className="text-xs uppercase tracking-wide opacity-80">Live preview</p>
                <p className="text-lg font-bold">{row.company_name}</p>
              </div>
            </CardContent>
          </Card>

          <Button onClick={save} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save profile
          </Button>

          <p className="text-[11px] text-slate-500 text-center mt-4">
            Saved values flow into <code className="bg-slate-100 px-1 rounded">AdminNav</code>,{" "}
            <code className="bg-slate-100 px-1 rounded">/c/order/[id]</code>,{" "}
            <code className="bg-slate-100 px-1 rounded">/c/account</code>, and{" "}
            <code className="bg-slate-100 px-1 rounded">googleMapsService.calculateDeliveryFee</code>.
          </p>
        </div>
      </div>
    </>
  );
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

export default function ProtectedCompanyProfile() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <CompanyProfilePage />
    </ProtectedRoute>
  );
}
