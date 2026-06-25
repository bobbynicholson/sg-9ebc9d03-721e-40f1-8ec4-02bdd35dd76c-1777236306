import { useState, useEffect } from "react";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader } from "@/components/portal/ui";
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
    <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
      <PlatformNav />

      <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
        <PortalHeader
          title="Package Pricing"
          subtitle="Subscription pricing across the SA, US, UK and EU markets"
          icon={DollarSign}
          actions={
            /* Cross-link to the COGS calculator - seeing the input cost
               next to the output price avoids quietly setting a tier
               that loses money at scale. */
            <a
              href="/admin/platform/tech-costs"
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-amber-300 hover:text-amber-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-amber-400"
            >
              See your COGS at this price
              <span aria-hidden>→</span>
            </a>
          }
        />

        {/* How it works - quiet inline note, not a loud coloured alert */}
        <PortalCard className="mb-6">
          <div className="flex gap-3">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-500" />
            <div className="min-w-0 text-sm text-slate-600 dark:text-slate-400">
              <p className="mb-1.5 font-semibold text-slate-900 dark:text-white">How pricing updates work</p>
              <ul className="space-y-1">
                <li>Edit the <strong className="text-slate-700 dark:text-slate-300">ZAR price</strong> - USD, GBP and EUR auto-calculate from the formula.</li>
                <li>Manual overrides are allowed for USD, GBP and EUR.</li>
                <li><strong className="text-slate-700 dark:text-slate-300">Save</strong> pushes the new prices live on the SA, US, UK and EU pages.</li>
              </ul>
            </div>
          </div>
        </PortalCard>

        {/* Conversion formula */}
        <PortalCard className="mb-6">
          <PortalCardHeader
            title={
              <span className="flex items-center gap-2">
                <Calculator className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-500" />
                Conversion formula
                <InfoTooltip content="The formula that converts ZAR pricing into the other supported currencies, using a fixed exchange rate per market.\n\nPrices are stored in the platform_pricing_plans table, saves here update /pricing for every visitor immediately." />
              </span>
            }
          />
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="mb-3 break-words font-mono text-sm font-semibold text-slate-900 dark:text-white sm:text-base">
              {PRICING_FORMULA}
            </p>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              {([["USD", EXCHANGE_RATES.USD], ["GBP", EXCHANGE_RATES.GBP], ["EUR", EXCHANGE_RATES.EUR]] as const).map(
                ([code, rate]) => (
                  <div key={code} className="flex items-center gap-2">
                    <Badge variant="outline" className="border-slate-200 bg-white text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {code}
                    </Badge>
                    <span className="text-slate-500 dark:text-slate-400">÷ {rate}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </PortalCard>

        {saveSuccess && (
          <Alert className="mb-6 border-brand-primary/20 bg-brand-primary/10 dark:border-brand-primary/30 dark:bg-brand-primary/10">
            <Check className="h-4 w-4 flex-shrink-0 text-brand-primary dark:text-brand-primary" />
            <AlertDescription className="text-sm font-medium text-brand-primary dark:text-brand-primary">
              Pricing updated. Changes are now live on all front-end pages.
            </AlertDescription>
          </Alert>
        )}

        {errorMsg && (
          <Alert className="mb-6 border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />
            <AlertDescription className="text-sm font-medium text-rose-800 dark:text-rose-300">
              {errorMsg}
            </AlertDescription>
          </Alert>
        )}

        {loading && (
          <Alert className="mb-6 border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <RefreshCw className="h-4 w-4 flex-shrink-0 animate-spin text-slate-500" />
            <AlertDescription className="text-sm text-slate-600 dark:text-slate-400">
              Loading current live pricing...
            </AlertDescription>
          </Alert>
        )}

        {/* Mobile-Optimized Pricing Cards */}
        <div className="grid gap-4 sm:gap-6 mb-6 sm:mb-8">
          {editedPricing.map((tier, index) => (
            <PortalCard key={tier.name}>
              <PortalCardHeader
                title={
                  <span className="text-xl sm:text-2xl flex items-center gap-2">
                    {tier.name} Plan
                    <InfoTooltip content="The monthly subscription price for this tier across every market.\n\nZAR is the primary price. USD, GBP and EUR auto-calculate from the formula but you can override them. Saves are persisted to platform_pricing_plans and reflected on the public /pricing page." />
                  </span>
                }
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAutoCalculate(index)}
                    className="gap-2 h-10 text-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Auto-Calculate
                  </Button>
                }
              />
              <p className="-mt-2 mb-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Monthly subscription pricing across all markets
              </p>
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                  {/* South Africa ZAR - Mobile Optimized */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
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
                        className="h-12 border-amber-200 pl-7 text-base font-bold focus:border-amber-400 dark:border-amber-500/40 sm:pl-8 sm:text-lg"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Base price for formula calculation
                    </p>
                  </div>

                  {/* United States USD - Mobile Optimized */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
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
                        className="h-12 border-slate-200 pl-7 text-base font-semibold focus:border-amber-400 dark:border-slate-700 sm:pl-8 sm:text-lg"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1 break-words">
                      Auto: ZAR {tier.zarPrice} × 3 ÷ {EXCHANGE_RATES.USD} = ${calculateForeignPrice(tier.zarPrice, EXCHANGE_RATES.USD)}
                    </p>
                  </div>

                  {/* United Kingdom GBP - Mobile Optimized */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
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
                        className="h-12 border-slate-200 pl-7 text-base font-semibold focus:border-amber-400 dark:border-slate-700 sm:pl-8 sm:text-lg"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1 break-words">
                      Auto: ZAR {tier.zarPrice} × 3 ÷ {EXCHANGE_RATES.GBP} = £{calculateForeignPrice(tier.zarPrice, EXCHANGE_RATES.GBP)}
                    </p>
                  </div>

                  {/* Europe EUR - Mobile Optimized */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
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
                        className="h-12 border-slate-200 pl-7 text-base font-semibold focus:border-amber-400 dark:border-slate-700 sm:pl-8 sm:text-lg"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1 break-words">
                      Auto: ZAR {tier.zarPrice} × 3 ÷ {EXCHANGE_RATES.EUR} = €{calculateForeignPrice(tier.zarPrice, EXCHANGE_RATES.EUR)}
                    </p>
                  </div>
                </div>
              </div>
            </PortalCard>
          ))}
        </div>

        {/* Sticky save bar */}
        <div className="sticky bottom-4 flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-16px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:p-5">
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            {hasChanges ? (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-medium">You have unsaved changes</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-brand-primary dark:text-brand-primary">
                <Check className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-medium">All changes saved</span>
              </div>
            )}
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasChanges}
              className="h-11 w-full gap-2 text-sm sm:w-auto"
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saving || loading}
              className="h-11 w-full gap-2 text-sm sm:w-auto"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save & update live pricing"}
            </Button>
          </div>
        </div>

        {/* Where saves land */}
        <PortalCard className="mt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-amber-600 dark:border-slate-700 dark:bg-slate-900 dark:text-amber-500">
              <Globe className="h-5 w-5" />
            </span>
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Where these prices go live
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Saving updates every market-specific pricing page automatically:
              </p>
              <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
                <li className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-500" />
                  <span><strong className="text-slate-700 dark:text-slate-300">/pricing</strong> - South Africa (ZAR)</span>
                </li>
                <li className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-500" />
                  <span><strong className="text-slate-700 dark:text-slate-300">/us/pricing</strong> - United States (USD)</span>
                </li>
                <li className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-500" />
                  <span><strong className="text-slate-700 dark:text-slate-300">/uk/pricing</strong> - United Kingdom (GBP)</span>
                </li>
              </ul>
            </div>
          </div>
        </PortalCard>
      </PortalShell>
    </div>
  );
}
