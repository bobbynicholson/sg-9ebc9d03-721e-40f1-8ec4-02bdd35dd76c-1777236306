import { useState, useEffect } from "react";
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
  Upload,
  Eye,
  RotateCcw,
  Save,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react";
import { useBranding } from "@/contexts/BrandingContext";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {  UserRole  } from "@/types/app";
import { useToast } from "@/hooks/use-toast";

export default function ProtectedWhiteLabelPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <WhiteLabelPage />
    </ProtectedRoute>
  );
}

function WhiteLabelPage() {
  const { branding, loading, saving, updateBranding, resetBranding, isWhiteLabeled } = useBranding();
  const { toast } = useToast();

  const [organizationName, setOrganizationName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [secondaryColor, setSecondaryColor] = useState("#7c3aed");
  const [accentColor, setAccentColor] = useState("#f59e0b");
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    if (branding) {
      setOrganizationName(branding.organizationName || "");
      setPrimaryColor(branding.colors.primary || "#2563eb");
      setSecondaryColor(branding.colors.secondary || "#7c3aed");
      setAccentColor(branding.colors.accent || "#f59e0b");
      setLogoUrl(branding.logoUrl || "");
    }
  }, [branding]);

  const handleSave = async () => {
    try {
      await updateBranding({
        organizationName,
        colors: {
          primary: primaryColor,
          secondary: secondaryColor,
          accent: accentColor,
        },
        logoUrl,
      });
      toast({
        title: "Branding saved",
        description: "Your colours, logo, and organisation name are now live for this tenant.",
      });
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message || "Could not write branding to your account. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset to default CateringMS branding? This clears your saved logo + colours.")) return;
    try {
      await resetBranding();
      setOrganizationName("CateringMS");
      setPrimaryColor("#2563eb");
      setSecondaryColor("#7c3aed");
      setAccentColor("#f59e0b");
      setLogoUrl("");
      toast({
        title: "Branding reset",
        description: "Defaults are back.",
      });
    } catch (e: any) {
      toast({
        title: "Reset failed",
        description: e?.message || "Could not clear branding. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
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
          <Link href="/admin/settings">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Settings
            </Button>
          </Link>

          <div className="mb-8">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg">
                  <Palette className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
                    White Label Branding
                    <InfoTooltip content={"Set your logo, organisation name, and three brand colours that show up on client portals and emails.\n\nSaved to your tenant -- every admin and client logged into your account sees the same branding."} />
                  </h1>
                  <p className="text-slate-600 mt-1">Customize your platform with your own branding</p>
                </div>
              </div>
              {isWhiteLabeled && (
                <Badge className="bg-green-100 text-green-700 border-green-200">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Custom Branding Active
                </Badge>
              )}
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
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setLogoUrl("")}
                          disabled={!logoUrl}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Upload your company logo (PNG, JPG, or SVG recommended)
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
                      Main brand color for buttons and highlights
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
                      Secondary color for accents and gradients
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
                      Accent color for highlights and attention
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <Button
                  onClick={handleSave}
                  disabled={saving || loading}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Branding"}
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
                        <li>Saved to your tenant in the database -- every admin and client on your account sees the same branding</li>
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