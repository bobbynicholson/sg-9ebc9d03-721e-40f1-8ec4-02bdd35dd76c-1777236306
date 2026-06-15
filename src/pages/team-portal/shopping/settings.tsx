import { useState, useEffect } from "react";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, Save, Loader2, Bell, AlertTriangle, ShoppingCart } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface ShopSettings {
  receiptRequiredOnComplete: boolean;
  varianceAlertPct: number;
  autoNotifyOnLowStock: boolean;
  defaultLeadTimeDays: number;
  preferRatedSuppliers: boolean;
  autoCreateListFromUpcoming: boolean;
  upcomingHorizonDays: number;
  notifyAdminOnVariance: boolean;
}

const DEFAULTS: ShopSettings = {
  receiptRequiredOnComplete: true,
  varianceAlertPct: 15,
  autoNotifyOnLowStock: true,
  defaultLeadTimeDays: 2,
  preferRatedSuppliers: true,
  autoCreateListFromUpcoming: false,
  upcomingHorizonDays: 7,
  notifyAdminOnVariance: true,
};

const storageKey = (companyId: string) => `cms_shopping_settings_${companyId}`;

export default function ShoppingSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [settings, setSettings] = useState<ShopSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.company_id || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey(user.company_id));
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
    setLoaded(true);
  }, [user?.company_id]);

  const update = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) => {
    setSettings((s) => ({ ...s, [k]: v }));
  };

  const save = () => {
    if (!user?.company_id) return;
    setSaving(true);
    try {
      localStorage.setItem(storageKey(user.company_id), JSON.stringify(settings));
      toast({ title: "Settings saved" });
    } catch { toast({ title: "Could not save", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Head><title>Shopping settings - CateringMS</title></Head>
      <NoIndexMeta />
      <ShoppingNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            {/* Wave 34: gradient-box icon header. */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md flex-shrink-0">
                <SettingsIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                  Shopping Settings
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">Procurement defaults for this catering company</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSettings(DEFAULTS)}>Reset</Button>
              <Button size="sm" onClick={save} disabled={saving || !loaded} className="bg-amber-600 hover:bg-amber-700">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : <><Save className="h-4 w-4 mr-2" />Save</>}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-amber-600" />Purchase runs <InfoTooltip content="Defaults used when a new shopping list is created, receipts, auto-generation window, lead time.\n\nSaved on this device only." /></CardTitle>
                <CardDescription>Defaults for shopping lists and procurement runs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="rrc">Require receipt to mark a list complete</Label>
                    <p className="text-xs text-slate-500 mt-0.5">Lists cannot be set to completed without a receipt URL</p>
                  </div>
                  <Switch id="rrc" checked={settings.receiptRequiredOnComplete} onCheckedChange={(v) => update("receiptRequiredOnComplete", v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="acu">Auto-create lists from upcoming events</Label>
                    <p className="text-xs text-slate-500 mt-0.5">Generate a draft shopping list from confirmed orders within the horizon</p>
                  </div>
                  <Switch id="acu" checked={settings.autoCreateListFromUpcoming} onCheckedChange={(v) => update("autoCreateListFromUpcoming", v)} />
                </div>
                <div>
                  <Label htmlFor="uh">Upcoming events horizon (days)</Label>
                  <p className="text-xs text-slate-500 mt-0.5 mb-2">How many days ahead to scan for procurement work</p>
                  <Input id="uh" type="number" min="1" max="60" value={settings.upcomingHorizonDays} onChange={(e) => update("upcomingHorizonDays", Number(e.target.value))} className="w-32" />
                </div>
                <div>
                  <Label htmlFor="lt">Default lead time (days)</Label>
                  <p className="text-xs text-slate-500 mt-0.5 mb-2">When ordering from a supplier, days needed before delivery</p>
                  <Input id="lt" type="number" min="0" max="30" value={settings.defaultLeadTimeDays} onChange={(e) => update("defaultLeadTimeDays", Number(e.target.value))} className="w-32" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />Variance + budget <InfoTooltip content="Sets when a shopping run gets flagged as over budget and whether the admin gets a notification.\n\nSaved on this device only." /></CardTitle>
                <CardDescription>Triggers for price-variance alerts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="va">Variance alert threshold (%)</Label>
                  <p className="text-xs text-slate-500 mt-0.5 mb-2">Alert when actual spend exceeds estimate by this percentage</p>
                  <Input id="va" type="number" min="0" max="100" value={settings.varianceAlertPct} onChange={(e) => update("varianceAlertPct", Number(e.target.value))} className="w-32" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="nav">Notify admin on variance breach</Label>
                    <p className="text-xs text-slate-500 mt-0.5">Push alert to company admin when a list goes over the threshold</p>
                  </div>
                  <Switch id="nav" checked={settings.notifyAdminOnVariance} onCheckedChange={(v) => update("notifyAdminOnVariance", v)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4 text-blue-600" />Suppliers + alerts <InfoTooltip content="How suppliers get ranked, plus the alert that fires when stock runs low.\n\nSaved on this device only." /></CardTitle>
                <CardDescription>Supplier preferences and notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="prs">Prefer rated suppliers (rating greater-than-equal-to 4)</Label>
                    <p className="text-xs text-slate-500 mt-0.5">Recommend high-rated suppliers first when generating lists</p>
                  </div>
                  <Switch id="prs" checked={settings.preferRatedSuppliers} onCheckedChange={(v) => update("preferRatedSuppliers", v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="anls">Auto-notify on low stock</Label>
                    <p className="text-xs text-slate-500 mt-0.5">When inventory hits par, push a notification to this team</p>
                  </div>
                  <Switch id="anls" checked={settings.autoNotifyOnLowStock} onCheckedChange={(v) => update("autoNotifyOnLowStock", v)} />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-50 border-slate-200">
              <CardContent className="p-4 text-xs text-slate-600">
                Settings stored locally per company until a per-tenant settings table lands. Toggles persist on this device but won't sync across the team yet, on the running todo for Phase 2.
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
