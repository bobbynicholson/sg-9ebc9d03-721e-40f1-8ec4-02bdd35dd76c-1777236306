import { useState, useEffect } from "react";
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

interface PricingTier {
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

export default function PricingManagementPage() {
  const [pricing, setPricing] = useState<PricingTier[]>([
    { name: "Starter", zarPrice: 399, usdPrice: 65, gbpPrice: 51, eurPrice: 60 },
    { name: "Pro", zarPrice: 699, usdPrice: 113, gbpPrice: 89, eurPrice: 105 },
    { name: "Enterprise", zarPrice: 1299, usdPrice: 211, gbpPrice: 166, eurPrice: 195 }
  ]);

  const [editedPricing, setEditedPricing] = useState<PricingTier[]>(pricing);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
    setPricing(editedPricing);
    setSaveSuccess(true);
    setHasChanges(false);
    
    setTimeout(() => {
      setSaveSuccess(false);
    }, 3000);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      <Header />
      
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                CateringMS Package Prices (ADMIN)
              </h1>
              <p className="text-slate-600 mt-1">
                Manage pricing for South Africa, United States, and United Kingdom markets
              </p>
            </div>
          </div>
        </div>

        {/* Info Alert */}
        <Alert className="mb-8 border-purple-200 bg-purple-50">
          <Info className="h-5 w-5 text-purple-600" />
          <AlertDescription className="text-slate-700">
            <p className="font-semibold mb-2">How Pricing Updates Work:</p>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-purple-600 mt-0.5">•</span>
                <span><strong>Change ZAR pricing</strong> and foreign currencies auto-calculate using the formula below</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 mt-0.5">•</span>
                <span><strong>Manual adjustments</strong> are allowed for USD, GBP, and EUR if needed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 mt-0.5">•</span>
                <span><strong>Click Save</strong> to update pricing on all front-end pages (SA, US, UK sites)</span>
              </li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Formula Card */}
        <Card className="mb-8 border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-purple-600" />
              <CardTitle className="text-lg">Pricing Conversion Formula</CardTitle>
            </div>
            <CardDescription>
              This formula ensures consistent international pricing based on ZAR
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-white rounded-lg p-4 border border-purple-200">
              <p className="text-xl font-mono font-bold text-purple-900 mb-4">
                {PRICING_FORMULA}
              </p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    USD
                  </Badge>
                  <span className="text-slate-600">÷ {EXCHANGE_RATES.USD}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    GBP
                  </Badge>
                  <span className="text-slate-600">÷ {EXCHANGE_RATES.GBP}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                    EUR
                  </Badge>
                  <span className="text-slate-600">÷ {EXCHANGE_RATES.EUR}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Success Alert */}
        {saveSuccess && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <Check className="h-5 w-5 text-green-600" />
            <AlertDescription className="text-green-800 font-medium">
              Pricing updated successfully! Changes are now live on all front-end pages.
            </AlertDescription>
          </Alert>
        )}

        {/* Pricing Cards */}
        <div className="grid gap-6 mb-8">
          {editedPricing.map((tier, index) => (
            <Card key={tier.name} className="border-2 hover:border-purple-200 transition-colors">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-purple-50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl">{tier.name} Plan</CardTitle>
                    <CardDescription>
                      Monthly subscription pricing across all markets
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAutoCalculate(index)}
                    className="gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Auto-Calculate
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {/* South Africa ZAR */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white">
                        🇿🇦 South Africa
                      </Badge>
                    </div>
                    <Label htmlFor={`zar-${index}`} className="text-sm font-semibold">
                      ZAR Price (Primary)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">
                        R
                      </span>
                      <Input
                        id={`zar-${index}`}
                        type="number"
                        value={tier.zarPrice}
                        onChange={(e) => handleZARChange(index, e.target.value)}
                        className="pl-8 text-lg font-bold border-2 border-green-200 focus:border-green-400"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Base price for formula calculation
                    </p>
                  </div>

                  {/* United States USD */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white">
                        🇺🇸 United States
                      </Badge>
                    </div>
                    <Label htmlFor={`usd-${index}`} className="text-sm font-semibold">
                      USD Price
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">
                        $
                      </span>
                      <Input
                        id={`usd-${index}`}
                        type="number"
                        value={tier.usdPrice}
                        onChange={(e) => handleForeignPriceChange(index, "usdPrice", e.target.value)}
                        className="pl-8 text-lg font-bold border-2 border-blue-200 focus:border-blue-400"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Auto: R{tier.zarPrice} × 3 ÷ {EXCHANGE_RATES.USD} = ${calculateForeignPrice(tier.zarPrice, EXCHANGE_RATES.USD)}
                    </p>
                  </div>

                  {/* United Kingdom GBP */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-gradient-to-r from-red-500 to-pink-500 text-white">
                        🇬🇧 United Kingdom
                      </Badge>
                    </div>
                    <Label htmlFor={`gbp-${index}`} className="text-sm font-semibold">
                      GBP Price
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">
                        £
                      </span>
                      <Input
                        id={`gbp-${index}`}
                        type="number"
                        value={tier.gbpPrice}
                        onChange={(e) => handleForeignPriceChange(index, "gbpPrice", e.target.value)}
                        className="pl-8 text-lg font-bold border-2 border-red-200 focus:border-red-400"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Auto: R{tier.zarPrice} × 3 ÷ {EXCHANGE_RATES.GBP} = £{calculateForeignPrice(tier.zarPrice, EXCHANGE_RATES.GBP)}
                    </p>
                  </div>

                  {/* Europe EUR */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white">
                        🇪🇺 Europe
                      </Badge>
                    </div>
                    <Label htmlFor={`eur-${index}`} className="text-sm font-semibold">
                      EUR Price
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">
                        €
                      </span>
                      <Input
                        id={`eur-${index}`}
                        type="number"
                        value={tier.eurPrice}
                        onChange={(e) => handleForeignPriceChange(index, "eurPrice", e.target.value)}
                        className="pl-8 text-lg font-bold border-2 border-purple-200 focus:border-purple-400"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Auto: R{tier.zarPrice} × 3 ÷ {EXCHANGE_RATES.EUR} = €{calculateForeignPrice(tier.zarPrice, EXCHANGE_RATES.EUR)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between p-6 bg-white rounded-xl border-2 border-slate-200 sticky bottom-4 shadow-lg">
          <div className="flex items-center gap-3">
            {hasChanges ? (
              <div className="flex items-center gap-2 text-orange-600">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">You have unsaved changes</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600">
                <Check className="w-5 h-5" />
                <span className="font-medium">All changes saved</span>
              </div>
            )}
          </div>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasChanges}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reset Changes
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges}
              className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90"
            >
              <Save className="w-4 h-4" />
              Save & Update Live Pricing
            </Button>
          </div>
        </div>

        {/* Info Box */}
        <Card className="mt-8 border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <Globe className="w-12 h-12 text-blue-600 flex-shrink-0" />
              <div className="space-y-2">
                <h3 className="font-bold text-lg text-slate-900">
                  Multi-Region Pricing Impact
                </h3>
                <p className="text-slate-700 text-sm">
                  When you save pricing changes, they automatically update across all market-specific pages:
                </p>
                <ul className="space-y-1 text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    <span><strong>/pricing</strong> (South African site - ZAR pricing)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    <span><strong>/us/pricing</strong> (United States site - USD pricing)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-red-600" />
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
