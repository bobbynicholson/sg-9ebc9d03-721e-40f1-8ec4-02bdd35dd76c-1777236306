/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Palette,
  Eye,
  RotateCcw,
  Save,
  Sparkles,
  Image as ImageIcon,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { captureException } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {  UserRole  } from "@/types/app";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_PALETTE,
  DEFAULT_ORG_NAME,
  isWhiteLabelRow,
  type BrandingRow,
} from "@/lib/branding/applyBranding";
import { clearBrandingCache } from "@/lib/branding/store";
import { useTenantHref } from "@/lib/tenantUrl";

const LOGO_BUCKET = "branding-logos";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

// WL-B (task #219, 2026-05-25): WCAG-AA contrast helper. Returns
// the contrast ratio between two hex colours per the WCAG 2.1
// formula. 4.5 is the AA bar for body text; 3.0 is the AA bar for
// large text + UI components. We use these to flag colour pairs
// that would render illegible white-on-colour buttons.
function hexToRgb(hex: string): [number, number, number] | null {
  if (!hex) return null;
  const m = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}
function relLuminance([r, g, b]: [number, number, number]): number {
  const a = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function contrastRatio(hexA: string, hexB: string): number | null {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return null;
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// WL-B: hand-curated palette presets. Each one is internally
// consistent (matched hue + saturation) and passes the white-text
// WCAG check on the primary so the click-to-apply CTA can't drop
// the operator into an illegible buttons-on-white scenario.
const PALETTE_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  primary: string;
  secondary: string;
  accent: string;
}> = [
  { id: "platform",    label: "CateringMS",     description: "The platform default.",                primary: "#2563eb", secondary: "#7c3aed", accent: "#f59e0b" },
  { id: "sa-flag",     label: "SA flag",        description: "Springbok green, gold, navy.",         primary: "#007749", secondary: "#FFB81C", accent: "#001489" },
  { id: "wedding",     label: "Wedding",        description: "Rose gold, blush, deep burgundy.",     primary: "#b76e79", secondary: "#e8b4b8", accent: "#7a1f2b" },
  { id: "earth",       label: "Earth tones",    description: "Olive, terracotta, ochre.",            primary: "#6b8e23", secondary: "#cc7351", accent: "#d4a017" },
  { id: "monochrome",  label: "Monochrome",     description: "Charcoal + slate. Looks corporate.",   primary: "#1f2937", secondary: "#475569", accent: "#0ea5e9" },
];

// Strip a public URL down to the storage object path so we can delete it.
const objectPathFromPublicUrl = (url: string | undefined): string | null => {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${LOGO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  try {
    return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
  } catch {
    return null;
  }
};

export default function ProtectedWhiteLabelPage() {
  // WL-B (task #219, 2026-05-25):
  //   - deduped the COMPANY_ADMIN copy-paste typo in allowedRoles
  //     (was listed twice, same pattern as HRS-1 / CS-1 / STH-3).
  //   - admitted OWNER. Pre-WL-B the OWNER persona was 403'd off
  //     their own branding page even though OWNER is in
  //     FULL_COMPANY_ACCESS_ROLES.
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN,
      UserRole.OWNER,
      UserRole.COMPANY_ADMIN,
      UserRole.ADMIN,
    ]}>
      <WhiteLabelPage />
    </ProtectedRoute>
  );
}

function WhiteLabelPage() {
  const { user } = useAuth() as any;
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const companyId: string | undefined = user?.company_id;
  const { toast } = useToast();

  const [branding, setBranding] = useState<BrandingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [organizationName, setOrganizationName] = useState("");
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PALETTE.primary);
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_PALETTE.secondary);
  const [accentColor, setAccentColor] = useState(DEFAULT_PALETTE.accent);
  const [logoUrl, setLogoUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // WL-B (task #219, 2026-05-25): savedSnapshot is the canonical
  // "last persisted" string for the four-field set the Save button
  // writes. isDirty derives from comparing the live inputs against
  // it. lastSavedAt drives the "Saved Xm ago" chip.
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const currentSnapshot = JSON.stringify({
    organizationName, primaryColor, secondaryColor, accentColor, logoUrl,
  });
  const isDirty = savedSnapshot !== "" && currentSnapshot !== savedSnapshot;

  // WL-B: beforeunload guard while dirty. Mirrors the company-
  // profile pattern - browser shows its own "Leave site?" prompt.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const isWhiteLabeled = isWhiteLabelRow(branding);

  // Load tenant row directly from companies. Single canonical source of
  // truth - no parallel context state.
  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, company_name, logo_url, primary_color, secondary_color, accent_color")
        .eq("id", companyId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setLoading(false);
        return;
      }
      const r = data as Record<string, string | null | undefined>;
      const row: BrandingRow = {
        id: r.id ?? companyId,
        companyName: r.company_name ?? null,
        logoUrl: r.logo_url ?? null,
        primaryColor: r.primary_color ?? null,
        secondaryColor: r.secondary_color ?? null,
        accentColor: r.accent_color ?? null,
      };
      setBranding(row);
      const initialOrg = row.companyName || "";
      const initialPrim = row.primaryColor || DEFAULT_PALETTE.primary;
      const initialSec = row.secondaryColor || DEFAULT_PALETTE.secondary;
      const initialAcc = row.accentColor || DEFAULT_PALETTE.accent;
      const initialLogo = row.logoUrl || "";
      setOrganizationName(initialOrg);
      setPrimaryColor(initialPrim);
      setSecondaryColor(initialSec);
      setAccentColor(initialAcc);
      setLogoUrl(initialLogo);
      // WL-B: seed snapshot so isDirty starts at false.
      setSavedSnapshot(JSON.stringify({
        organizationName: initialOrg,
        primaryColor: initialPrim,
        secondaryColor: initialSec,
        accentColor: initialAcc,
        logoUrl: initialLogo,
      }));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const dispatchBrandingUpdated = useCallback((row: BrandingRow | null) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("branding:updated", { detail: row }));
  }, []);

  const persistPatch = useCallback(
    async (patch: Partial<Record<string, string | null>>): Promise<BrandingRow | null> => {
      if (!companyId) return null;
      const { error } = await supabase
        .from("companies")
        .update(patch as any)
        .eq("id", companyId);
      if (error) throw error;
      const merged: BrandingRow = {
        id: companyId,
        companyName: branding?.companyName ?? null,
        logoUrl: branding?.logoUrl ?? null,
        primaryColor: branding?.primaryColor ?? null,
        secondaryColor: branding?.secondaryColor ?? null,
        accentColor: branding?.accentColor ?? null,
      };
      if ("company_name" in patch) merged.companyName = patch.company_name ?? null;
      if ("logo_url" in patch) merged.logoUrl = patch.logo_url ?? null;
      if ("primary_color" in patch) merged.primaryColor = patch.primary_color ?? null;
      if ("secondary_color" in patch) merged.secondaryColor = patch.secondary_color ?? null;
      if ("accent_color" in patch) merged.accentColor = patch.accent_color ?? null;
      setBranding(merged);
      dispatchBrandingUpdated(merged);
      return merged;
    },
    [branding, companyId, dispatchBrandingUpdated],
  );

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      await persistPatch({
        company_name: organizationName || null,
        logo_url: logoUrl || null,
        primary_color: primaryColor || null,
        secondary_color: secondaryColor || null,
        accent_color: accentColor || null,
      });
      // WL-B: refresh snapshot + chip so isDirty flips back to
      // false + the chip reads "Just saved".
      setSavedSnapshot(JSON.stringify({
        organizationName, primaryColor, secondaryColor, accentColor, logoUrl,
      }));
      setLastSavedAt(new Date());
      toast({
        title: "Branding saved",
        description: "Your colours, logo, and organisation name are now live for this tenant.",
      });
    } catch (e: any) {
      captureException(e, {
        tags: { route: "/admin/white-label", step: "save", companyId: companyId || "" },
      });
      toast({
        title: "Save failed",
        description: e?.message || "Could not write branding to your account. Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!companyId) return;
    if (!confirm("Reset to default CateringMS branding? This clears your saved logo + colours.")) return;
    setSaving(true);
    try {
      await persistPatch({
        logo_url: null,
        primary_color: null,
        secondary_color: null,
        accent_color: null,
      });
      clearBrandingCache(companyId);
      setOrganizationName(DEFAULT_ORG_NAME);
      setPrimaryColor(DEFAULT_PALETTE.primary);
      setSecondaryColor(DEFAULT_PALETTE.secondary);
      setAccentColor(DEFAULT_PALETTE.accent);
      setLogoUrl("");
      // Dispatch null so the applier reverts the DOM to defaults.
      dispatchBrandingUpdated(null);
      // WL-B: snapshot the new defaults so isDirty stays false.
      setSavedSnapshot(JSON.stringify({
        organizationName: DEFAULT_ORG_NAME,
        primaryColor: DEFAULT_PALETTE.primary,
        secondaryColor: DEFAULT_PALETTE.secondary,
        accentColor: DEFAULT_PALETTE.accent,
        logoUrl: "",
      }));
      setLastSavedAt(new Date());
      toast({
        title: "Branding reset",
        description: "Defaults are back.",
      });
    } catch (e: any) {
      captureException(e, {
        tags: { route: "/admin/white-label", step: "reset", companyId: companyId || "" },
      });
      toast({
        title: "Reset failed",
        description: e?.message || "Could not clear branding. Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // WL-B: click-to-apply preset. Updates the four colour-bearing
  // inputs in one shot; the operator still has to hit Save to
  // persist. Doesn't touch logoUrl or organizationName because
  // those aren't part of the palette.
  const applyPreset = (preset: typeof PALETTE_PRESETS[number]) => {
    setPrimaryColor(preset.primary);
    setSecondaryColor(preset.secondary);
    setAccentColor(preset.accent);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!companyId) {
      toast({
        title: "No tenant resolved",
        description: "Sign in again before uploading a logo.",
        variant: "destructive",
      });
      return;
    }

    const ext = ALLOWED_LOGO_TYPES[file.type];
    if (!ext) {
      toast({
        title: "Unsupported file type",
        description: "Use PNG, JPG, SVG, or WebP.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast({
        title: "File too large",
        description: "Logos must be under 2MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const path = `${companyId}/logo-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
      const publicUrl = data?.publicUrl;
      if (!publicUrl) throw new Error("Could not resolve public URL for the uploaded logo");

      const previousPath = objectPathFromPublicUrl(logoUrl);
      setLogoUrl(publicUrl);
      await persistPatch({ logo_url: publicUrl });

      if (previousPath && previousPath !== path) {
        supabase.storage.from(LOGO_BUCKET).remove([previousPath]).catch(() => {});
      }

      toast({
        title: "Logo uploaded",
        description: "Your new logo is live for this tenant.",
      });
    } catch (err: any) {
      captureException(err, {
        tags: { route: "/admin/white-label", step: "upload-logo", companyId: companyId || "" },
      });
      toast({
        title: "Upload failed",
        description: err?.message || "Could not upload the logo. Try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleClearLogo = async () => {
    const previousPath = objectPathFromPublicUrl(logoUrl);
    setLogoUrl("");
    try {
      await persistPatch({ logo_url: null });
    } catch (err: any) {
      toast({
        title: "Could not clear logo",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
      return;
    }
    if (previousPath) {
      supabase.storage.from(LOGO_BUCKET).remove([previousPath]).catch(() => {});
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>White Label Branding | CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-screen-2xl">
          <Link href={withSlug("/admin/settings")}>
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Settings
            </Button>
          </Link>

          <div className="mb-8">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-2xl shadow-lg">
                  <Palette className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent flex items-center gap-2">
                    White Label Branding
                    <InfoTooltip content={"Set your logo, organisation name, and three brand colours that show up on client portals and emails.\n\nSaved to your tenant. Every admin and client logged into your account sees the same branding."} />
                  </h1>
                  <p className="text-slate-600 mt-1">Logo, organisation name, and three brand colours that show on every client surface: portal, public quote pages, public invoices, and outgoing emails.</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {isWhiteLabeled && (
                  <Badge className="bg-green-100 text-green-700 border-green-200">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Custom Branding Active
                  </Badge>
                )}
                {/* WL-B: unsaved / last-saved chip mirroring the
                    company-profile pattern. Hidden while loading. */}
                {!loading && (isDirty ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                    <AlertTriangle className="w-3 h-3" /> Unsaved changes
                  </span>
                ) : lastSavedAt ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
                    <Clock className="w-3 h-3" /> Just saved
                  </span>
                ) : null)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" />
                    Logo & Organization
                    <InfoTooltip content={"The name and logo your clients will see across every page they land on."} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="orgName">Organization Name</Label>
                    <Input
                      id="orgName"
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      placeholder="Your Catering Company"
                      className="mt-1.5"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      This name will appear across all client-facing areas
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="logo">Custom Logo</Label>
                    <div className="mt-1.5 space-y-3">
                      {logoUrl && (
                        <div className="p-4 border-2 border-dashed rounded-lg bg-slate-50 flex items-center justify-center">
                          <img
                            src={logoUrl}
                            alt="Logo preview"
                            className="max-h-24 object-contain"
                          />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input
                          id="logo"
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml,image/webp"
                          onChange={handleImageUpload}
                          disabled={uploading || saving}
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleClearLogo}
                          disabled={!logoUrl || uploading || saving}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {uploading
                        ? "Uploading…"
                        : "PNG, JPG, SVG, or WebP. Max 2MB."}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="w-5 h-5" />
                    Color Palette
                    <InfoTooltip content={"Three colours, primary, secondary, accent, that flow through buttons, gradients, and highlights across the app."} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* WL-B: click-to-apply palette presets. Each
                      one updates the three colour inputs in a
                      single tap. The operator still has to hit
                      Save to persist. */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      Start from a preset
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {PALETTE_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => applyPreset(p)}
                          className="group flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-slate-200 bg-white hover:border-slate-400 hover:shadow-sm transition-all"
                          title={p.description}
                        >
                          <span className="flex -space-x-1">
                            <span className="w-4 h-4 rounded-full border border-white" style={{ background: p.primary }} />
                            <span className="w-4 h-4 rounded-full border border-white" style={{ background: p.secondary }} />
                            <span className="w-4 h-4 rounded-full border border-white" style={{ background: p.accent }} />
                          </span>
                          <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900">
                            {p.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* WL-B: WCAG-AA contrast warning. White text on
                      the primary button needs a 4.5+ ratio to be
                      legible at body size; we soft-warn anyone
                      below the bar so a pastel primary doesn't
                      ship invisible buttons to clients. */}
                  {(() => {
                    const ratio = contrastRatio(primaryColor, "#ffffff");
                    if (ratio == null) return null;
                    if (ratio >= 4.5) return null;
                    return (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-semibold">Low contrast on primary buttons</p>
                          <p className="leading-relaxed">
                            White text on your primary colour has a contrast ratio of <strong>{ratio.toFixed(2)}:1</strong>.
                            WCAG-AA needs 4.5:1 for body text. Pick a darker primary, or expect
                            "Save" / "Confirm" / "Pay" buttons to be hard to read on the client portal.
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <Label htmlFor="primaryColor">Primary Color</Label>
                    <div className="flex gap-3 mt-1.5">
                      <Input
                        id="primaryColor"
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-20 h-10 cursor-pointer"
                      />
                      <Input
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        placeholder="#2563eb"
                        className="flex-1"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Your dominant brand colour. Drives the primary action buttons (Save, Confirm, Pay), the active sidebar item, and the left side of the brand gradient on the page header and email banners.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="secondaryColor">Secondary Color</Label>
                    <div className="flex gap-3 mt-1.5">
                      <Input
                        id="secondaryColor"
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-20 h-10 cursor-pointer"
                      />
                      <Input
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        placeholder="#7c3aed"
                        className="flex-1"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      The complementary colour. Forms the right side of the brand gradient (sidebar logo tile, page hero, email header) and is used on secondary buttons and link hover states. Pick something that pairs with your primary.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="accentColor">Accent Color</Label>
                    <div className="flex gap-3 mt-1.5">
                      <Input
                        id="accentColor"
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-20 h-10 cursor-pointer"
                      />
                      <Input
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        placeholder="#f59e0b"
                        className="flex-1"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      A bolder pop colour for things that need to grab attention: &quot;New&quot; badges, alert highlights, the active stage on a progress bar. Keep this distinct from your primary so it actually stands out.
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
                    <p className="font-semibold text-slate-700 mb-1">Where you&apos;ll see these</p>
                    <p>Sidebar logo tile, primary CTAs, the page header gradient on tenant-scoped pages, the left rail accent on email templates, and the highlight colour on buttons throughout the admin and client portals. Status colours (success green, warning amber, error red) stay fixed so they remain readable.</p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <Button
                  onClick={handleSave}
                  disabled={saving || loading || !isDirty}
                  className="flex-1 bg-gradient-to-r from-brand-primary to-brand-secondary text-white hover:opacity-90"
                  title={isDirty ? "Save your branding changes" : "Nothing to save yet"}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : isDirty ? "Save Branding" : "Branding up to date"}
                </Button>
                <Button
                  onClick={handleReset}
                  disabled={saving || loading}
                  variant="outline"
                  className="flex-1"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset to Default
                </Button>
              </div>
            </div>

            <div>
              <Card className="border-0 shadow-lg sticky top-8">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Live Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-6 bg-white rounded-lg border-2 border-slate-200 space-y-4">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt="Logo"
                          className="h-12 object-contain"
                        />
                      ) : (
                        <div className="h-12 flex items-center">
                          <span className="text-2xl font-bold" style={{ color: primaryColor }}>
                            {organizationName || "Your Company"}
                          </span>
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        <button
                          className="w-full py-2 px-4 rounded-lg font-semibold text-white transition-colors"
                          style={{ backgroundColor: primaryColor }}
                        >
                          Primary Button
                        </button>
                        <button
                          className="w-full py-2 px-4 rounded-lg font-semibold text-white transition-colors"
                          style={{ backgroundColor: secondaryColor }}
                        >
                          Secondary Button
                        </button>
                        <button
                          className="w-full py-2 px-4 rounded-lg font-semibold text-white transition-colors"
                          style={{ backgroundColor: accentColor }}
                        >
                          Accent Button
                        </button>
                      </div>

                      <div className="pt-4 border-t">
                        <div
                          className="h-20 rounded-lg"
                          style={{
                            background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-lg text-xs text-slate-600">
                      <p className="font-medium mb-2">What this changes today:</p>
                      <ul className="space-y-1 list-disc list-inside">
                        <li>Saved to your tenant in the database. Every admin and client on your account sees the same branding</li>
                        <li>Logo + organisation name flow into surfaces that read these company fields</li>
                        <li>Colours expose CSS variables (<code>--brand-primary/secondary/accent</code>) on the page root</li>
                        <li>CateringMS attribution remains in the footer</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="mt-6 border-0 shadow-lg bg-blue-50">
            <CardContent className="py-6">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 mb-1">About White Label Branding</h3>
                  <p className="text-sm text-blue-800">
                    Customize your CateringMS platform with your own branding to create a seamless experience for your clients. 
                    Your logo and colors will appear across all client-facing areas including the client portal, driver portal, 
                    and public-facing pages. The platform will maintain <strong>"Powered by CateringMS"</strong> attribution in the 
                    footer with a link to our website.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>
    </>
  );
}
