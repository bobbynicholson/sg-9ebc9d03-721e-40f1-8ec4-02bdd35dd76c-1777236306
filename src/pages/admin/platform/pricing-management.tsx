import { useState, useEffect } from "react";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DollarSign,
  Save,
  RefreshCw,
  TrendingUp,
  Globe,
  Info,
  AlertCircle,
  Check,
  Calculator
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";

interface PricingTier {
  slug: string;
  name: string;
  zarPrice: number;
  usdPrice: number;
  gbpPrice: number;
  eurPrice: number;
}

const EXCHANGE_RATES = {
  USD: 18.5,
  GBP: 23.5,
  EUR: 20.0
};

const PRICING_FORMULA = "Foreign Currency = (ZAR Price × 3) ÷ Exchange Rate";

const FALLBACK_TIERS: PricingTier[] = [
  { slug: "starter", name: "Starter", zarPrice: 999, usdPrice: 162, gbpPrice: 128, eurPrice: 150 },
  { slug: "pro", name: "Pro", zarPrice: 1799, usdPrice: 292, gbpPrice: 230, eurPrice: 270 },
  { slug: "enterprise", name: "Enterprise", zarPrice: 2999, usdPrice: 486, gbpPrice: 383, eurPrice: 450 },
];

// Wave 24: super_admin gate. The page sets the platform-wide
// subscription pricing list (ZAR + USD/GBP/EUR). Tenant admins
// MUST NOT be able to mutate platform pricing.
export default function ProtectedPricingManagementPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <PricingManagementPage />
    </ProtectedRoute>
  );
}

function PricingManagementPage() {
  const [pricing, setPricing] = useState<PricingTier[]>(FALLBACK_TIERS);
  const [editedPricing, setEditedPricing] = useState<PricingTier[]>(FALLBACK_TIERS);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch live plans on mount. Falls back to seeded defaults if the
  // API misbehaves so the UI is never blank.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/platform/pricing-plans");
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Could not load pricing");
        const plans = (j.plans || []) as Array<{
          slug: string; name: string; zar_price: number; usd_price: number;
          gbp_price: number; eur_price: number;
        }>;
        if (cancelled) return;
        if (plans.length) {
          const mapped: PricingTier[] = plans.map((p) => ({
            slug: p.slug,
            name: p.name,
            zarPrice: Number(p.zar_price),
            usdPrice: Number(p.usd_price),
            gbpPrice: Number(p.gbp_price),
            eurPrice: Number(p.eur_price),
          }));
          setPricing(mapped);
          setEditedPricing(mapped);
        }
      } catch (e: any) {
        setErrorMsg(e?.message || "Could not load pricing");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const isDifferent = JSON.stringify(pricing) !== JSON.stringify(editedPricing);
    setHasChanges(isDifferent);
  }, [editedPricing, pricing]);

  const calculateForeignPrice = (zarPrice: number, exchangeRate: number): number => {
    return Math.round((zarPrice * 3) / exchangeRate);
  };

  const handleZARChange = (index: number, value: string) => {
    const zarPrice = parseInt(value) || 0;
    const updated = [...editedPricing];
    updated[index] = {
      ...updated[index],
      zarPrice,
      usdPrice: calculateForeignPrice(zarPrice, EXCHANGE_RATES.USD),
      gbpPrice: calculateForeignPrice(zarPrice, EXCHANGE_RATES.GBP),
      eurPrice: calculateForeignPrice(zarPrice, EXCHANGE_RATES.EUR)
    };
    setEditedPricing(updated);
  };

  const handleForeignPriceChange = (index: number, currency: "usdPrice" | "gbpPrice" | "eurPrice", value: string) => {
    const price = parseInt(value) || 0;
    const updated = [...editedPricing];
    updated[index] = {
      ...updated[index],
      [currency]: price
    };
    setEditedPricing(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const r = await fetch("/api/platform/pricing-plans", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plans: editedPricing.map((t) => ({
            slug: t.slug,
            name: t.name,
            zar_price: t.zarPrice,
            usd_price: t.usdPrice,
            gbp_price: t.gbpPrice,
            eur_price: t.eurPrice,
          })),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Save failed");
      setPricing(editedPricing);
      setSaveSuccess(true);
      setHasChanges(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      setErrorMsg(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setEditedPricing(pricing);
    setHasChanges(false);
  };

  const handleAutoCalculate = (index: number) => {
    const zarPrice = editedPricing[index].zarPrice;
    const updated = [...editedPricing];
    updated[index] = {
      ...updated[index],
      usdPrice: calculateForeignPrice(zarPrice, EXCHANGE_RATES.USD),
      gbpPrice: calculateForeignPrice(zarPrice, EXCHANGE_RATES.GBP),
      eurPrice: calculateForeignPrice(zarPrice, EXCHANGE_RATES.EUR)
    };
    setEditedPricing(updated);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80 pt-20 lg:pt-0">
      <PlatformNav />
      <Header />
      
      <div className="px-4 py-6 sm:py-8 max-w-full">
        {/* Mobile-Optimized Page Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-xl w-fit">
                <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                  CateringMS Package Prices (ADMIN)
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Manage pricing for South Africa, United States, and United Kingdom markets
                </p>
              </div>
            </div>
            {/* Cross-link to the COGS calculator - seeing the input cost
                next to the output price avoids quietly setting a tier
                that loses money at scale. */}
            <a
              href="/admin/platform/tech-costs"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-medium hover:bg-emerald-100 transition w-fit"
            >
              See your COGS at this price
              <span aria-hidden>→</span>
            </a>
          </div>
        </div>

        {/* Mobile-Optimized Info Alert */}
        <Alert className="mb-6 sm:mb-8 border-purple-200 bg-purple-50">
          <Info className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 flex-shrink-0 mt-0.5" />
          <AlertDescription className="text-slate-700">
            <p className="font-semibold mb-2 text-sm sm:text-base">How Pricing Updates Work:</p>
            <ul className="space-y-1.5 text-xs sm:text-sm">
              <li className="flex items-start gap-2">
                <span className="text-purple-600 mt-0.5 flex-shrink-0">•</span>
                <span><strong>Change ZAR pricing</strong> and foreign currencies auto-calculate using the formula below</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 mt-0.5 flex-shrink-0">•</span>
                <span><strong>Manual adjustments</strong> are allowed for USD, GBP, and EUR if needed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 mt-0.5 flex-shrink-0">•</span>
                <span><strong>Click Save</strong> to update pricing on all front-end pages (SA, US, UK sites)</span>
              </li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Mobile-Optimized Formula Card */}
        <Card className="mb-6 sm:mb-8 border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
          <CardHeader className="pb-3 sm:pb-6">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 flex-shrink-0" />
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                Pricing Conversion Formula
                <InfoTooltip content="The formula that converts ZAR pricing into the other supported currencies, using a fixed exchange rate per market.\n\nPrices are stored in the platform_pricing_plans table, saves here update /pricing for every visitor immediately." />
              </CardTitle>
            </div>
            <CardDescription className="text-xs sm:text-sm">
              This formula ensures consistent international pricing based on ZAR
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-white rounded-lg p-3 sm:p-4 border border-purple-200">
              <p className="text-sm sm:text-xl font-mono font-bold text-purple-900 mb-3 sm:mb-4 break-words">
                {PRICING_FORMULA}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                    USD
                  </Badge>
                  <span className="text-slate-600">÷ {EXCHANGE_RATES.USD}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                    GBP
                  </Badge>
                  <span className="text-slate-600">÷ {EXCHANGE_RATES.GBP}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                    EUR
                  </Badge>
                  <span className="text-slate-600">÷ {EXCHANGE_RATES.EUR}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mobile-Optimized Success Alert */}
        {saveSuccess && (
          <Alert className="mb-4 sm:mb-6 border-green-200 bg-green-50">
            <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 flex-shrink-0" />
            <AlertDescription className="text-green-800 font-medium text-xs sm:text-sm">
              Pricing updated successfully! Changes are now live on all front-end pages.
            </AlertDescription>
          </Alert>
        )}

        {errorMsg && (
          <Alert className="mb-4 sm:mb-6 border-rose-200 bg-rose-50">
            <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-rose-600 flex-shrink-0" />
            <AlertDescription className="text-rose-800 font-medium text-xs sm:text-sm">
              {errorMsg}
            </AlertDescription>
          </Alert>
        )}

        {loading && (
          <Alert className="mb-4 sm:mb-6 border-slate-200 bg-slate-50">
            <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5 text-slate-500 flex-shrink-0 animate-spin" />
            <AlertDescription className="text-slate-700 text-xs sm:text-sm">
              Loading current live pricing...
            </AlertDescription>
          </Alert>
        )}

        {/* Mobile-Optimized Pricing Cards */}
        <div className="grid gap-4 sm:gap-6 mb-6 sm:mb-8">
          {editedPricing.map((tier, index) => (
            <Card key={tier.name} className="border-2 hover:border-purple-200 transition-colors">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl sm:text-2xl flex items-center gap-2">
                      {tier.name} Plan
                      <InfoTooltip content="The monthly subscription price for this tier across every market.\n\nZAR is the primary price. USD, GBP and EUR auto-calculate from the formula but you can override them. Saves are persisted to platform_pricing_plans and reflected on the public /pricing page." />
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Monthly subscription pricing across all markets
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAutoCalculate(index)}
                    className="gap-2 w-full sm:w-auto h-10 text-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Auto-Calculate
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4 sm:pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                  {/* South Africa ZAR - Mobile Optimized */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-gradient-to-r from-brand-primary to-brand-secondary text-white text-xs">
                        🇿🇦 South Africa
                      </Badge>
                    </div>
                    <Label htmlFor={`zar-${index}`} className="text-xs sm:text-sm font-semibold">
                      ZAR Price (Primary)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm sm:text-base">
                        R
                      </span>
                      <Input
                        id={`zar-${index}`}
                        type="number"
                        value={tier.zarPrice}
                        onChange={(e) => handleZARChange(index, e.target.value)}
                        className="pl-7 sm:pl-8 text-base sm:text-lg font-bold border-2 border-green-200 focus:border-green-400 h-12"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Base price for formula calculation
                    </p>
                  </div>

                  {/* United States USD - Mobile Optimized */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs">
                        🇺🇸 United States
                      </Badge>
                    </div>
                    <Label htmlFor={`usd-${index}`} className="text-xs sm:text-sm font-semibold">
                      USD Price
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm sm:text-base">
                        $
                      </span>
                      <Input
                        id={`usd-${index}`}
                        type="number"
                        value={tier.usdPrice}
                        onChange={(e) => handleForeignPriceChange(index, "usdPrice", e.target.value)}
                        className="pl-7 sm:pl-8 text-base sm:text-lg font-bold border-2 border-blue-200 focus:border-blue-400 h-12"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1 break-words">
                      Auto: ZAR {tier.zarPrice} × 3 ÷ {EXCHANGE_RATES.USD} = ${calculateForeignPrice(tier.zarPrice, EXCHANGE_RATES.USD)}
                    </p>
                  </div>

                  {/* United Kingdom GBP - Mobile Optimized */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs">
                        🇬🇧 United Kingdom
                      </Badge>
                    </div>
                    <Label htmlFor={`gbp-${index}`} className="text-xs sm:text-sm font-semibold">
                      GBP Price
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm sm:text-base">
                        £
                      </span>
                      <Input
                        id={`gbp-${index}`}
                        type="number"
                        value={tier.gbpPrice}
                        onChange={(e) => handleForeignPriceChange(index, "gbpPrice", e.target.value)}
                        className="pl-7 sm:pl-8 text-base sm:text-lg font-bold border-2 border-red-200 focus:border-red-400 h-12"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1 break-words">
                      Auto: ZAR {tier.zarPrice} × 3 ÷ {EXCHANGE_RATES.GBP} = £{calculateForeignPrice(tier.zarPrice, EXCHANGE_RATES.GBP)}
                    </p>
                  </div>

                  {/* Europe EUR - Mobile Optimized */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs">
                        🇪🇺 Europe
                      </Badge>
                    </div>
                    <Label htmlFor={`eur-${index}`} className="text-xs sm:text-sm font-semibold">
                      EUR Price
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm sm:text-base">
                        €
                      </span>
                      <Input
                        id={`eur-${index}`}
                        type="number"
                        value={tier.eurPrice}
                        onChange={(e) => handleForeignPriceChange(index, "eurPrice", e.target.value)}
                        className="pl-7 sm:pl-8 text-base sm:text-lg font-bold border-2 border-purple-200 focus:border-purple-400 h-12"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1 break-words">
                      Auto: ZAR {tier.zarPrice} × 3 ÷ {EXCHANGE_RATES.EUR} = €{calculateForeignPrice(tier.zarPrice, EXCHANGE_RATES.EUR)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Mobile-Optimized Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 bg-white rounded-xl border-2 border-slate-200 sticky bottom-4 shadow-lg">
          <div className="flex items-center gap-3 justify-center sm:justify-start">
            {hasChanges ? (
              <div className="flex items-center gap-2 text-orange-600">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                <span className="font-medium text-sm sm:text-base">You have unsaved changes</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600">
                <Check className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                <span className="font-medium text-sm sm:text-base">All changes saved</span>
              </div>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasChanges}
              className="gap-2 w-full sm:w-auto h-12 text-sm sm:text-base"
            >
              <RefreshCw className="w-4 h-4" />
              Reset Changes
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saving || loading}
              className="gap-2 w-full sm:w-auto h-12 text-sm sm:text-base bg-gradient-to-r from-brand-primary to-brand-secondary hover:opacity-90"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : "Save & Update Live Pricing"}
            </Button>
          </div>
        </div>

        {/* Mobile-Optimized Info Box */}
        <Card className="mt-6 sm:mt-8 border-blue-200 bg-blue-50">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <Globe className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600 flex-shrink-0" />
              <div className="space-y-2">
                <h3 className="font-bold text-base sm:text-lg text-slate-900">
                  Multi-Region Pricing Impact
                </h3>
                <p className="text-slate-700 text-xs sm:text-sm">
                  When you save pricing changes, they automatically update across all market-specific pages:
                </p>
                <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-600 flex-shrink-0" />
                    <span><strong>/pricing</strong> (South African site - ZAR pricing)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 flex-shrink-0" />
                    <span><strong>/us/pricing</strong> (United States site - USD pricing)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-red-600 flex-shrink-0" />
                    <span><strong>/uk/pricing</strong> (United Kingdom site - GBP pricing)</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
}
