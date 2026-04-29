import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Plus, Trash2, Save, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { inventoryService } from "@/services/inventoryService";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";

const SUGGESTED_CATEGORIES = [
  "Default", "Dairy", "Produce", "Meat & Poultry", "Seafood",
  "Bakery", "Frozen", "Dry Goods", "Beverages", "Condiments",
];

interface Props {
  companyId?: string | null;
}

export function InventorySettingsTab({ companyId: companyIdProp }: Props = {}) {
  const { toast } = useToast();
  const { user, profile } = useAuth() as any;
  const companyId = companyIdProp ?? profile?.company_id ?? user?.company_id ?? null;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [warningRows, setWarningRows] = useState<Array<{ id: string; category: string; days: string }>>([]);
  const [reorderBuffer, setReorderBuffer] = useState<string>("0");

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    inventoryService.getCompanyInventorySettings(companyId).then(s => {
      const entries = Object.entries(s.expiryWarnings || {});
      const rows = entries.length > 0
        ? entries.map(([category, days]) => ({
            id: Math.random().toString(36).slice(2, 9),
            category,
            days: String(days),
          }))
        : [{ id: "default", category: "Default", days: "30" }];
      // Make sure "Default" is always present and first
      const hasDefault = rows.some(r => r.category === "Default");
      if (!hasDefault) {
        rows.unshift({ id: "default", category: "Default", days: "30" });
      } else {
        rows.sort((a, b) => a.category === "Default" ? -1 : b.category === "Default" ? 1 : a.category.localeCompare(b.category));
      }
      setWarningRows(rows);
      setReorderBuffer(String(s.reorderBufferPercent ?? 0));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [companyId]);

  const updateRow = (id: string, patch: Partial<{ category: string; days: string }>) => {
    setWarningRows(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const removeRow = (id: string) => {
    setWarningRows(rows => rows.filter(r => r.id !== id));
  };

  const addRow = () => {
    setWarningRows(rows => [...rows, { id: Math.random().toString(36).slice(2, 9), category: "", days: "30" }]);
  };

  const handleSave = async () => {
    if (!companyId) { setError("No company on your profile."); return; }

    // Build the expiryWarnings object, dedupe by category, drop empty rows.
    const expiryWarnings: Record<string, number> = {};
    for (const row of warningRows) {
      const cat = row.category.trim();
      const days = Number(row.days);
      if (!cat || isNaN(days) || days < 0) continue;
      expiryWarnings[cat] = days;
    }

    if (!expiryWarnings.Default) {
      setError("A Default expiry threshold is required. Add a row with category 'Default'.");
      return;
    }

    const buffer = Number(reorderBuffer);
    if (isNaN(buffer) || buffer < 0 || buffer > 100) {
      setError("Reorder buffer must be a number between 0 and 100.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await inventoryService.updateCompanyInventorySettings(companyId, {
        expiryWarnings,
        reorderBufferPercent: buffer,
      });
      toast({ title: "Inventory settings saved" });
    } catch (e: any) {
      setError(e?.message ?? "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="py-8 text-center text-sm text-slate-500">Loading...</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
          <Package className="w-4 h-4 md:w-5 md:h-5" />
          Inventory Settings
          <InfoTooltip content={"Configure how the inventory page warns the team about expiring stock and how aggressive the reorder buffer should be."} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 px-4 md:px-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <Label className="text-sm md:text-base font-medium">Expiry warning thresholds</Label>
              <p className="text-xs text-slate-500 mt-0.5">
                How many days before a batch expires we flag it. Per category, with a Default fallback.
              </p>
            </div>
          </div>
          <div className="rounded-md border border-slate-200 divide-y divide-slate-100">
            {warningRows.map(row => (
              <div key={row.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2">
                <div className="col-span-7">
                  <Input
                    list="cat-suggestions"
                    value={row.category}
                    onChange={e => updateRow(row.id, { category: e.target.value })}
                    placeholder="Category name"
                    className="text-sm h-9"
                    disabled={row.category === "Default"}
                  />
                </div>
                <div className="col-span-3">
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min="0"
                      value={row.days}
                      onChange={e => updateRow(row.id, { days: e.target.value })}
                      className="text-sm h-9 tabular-nums"
                    />
                    <span className="text-xs text-slate-500">days</span>
                  </div>
                </div>
                <div className="col-span-2 flex items-center justify-end">
                  {row.category !== "Default" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => removeRow(row.id)}
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <datalist id="cat-suggestions">
              {SUGGESTED_CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
            <div className="px-2 py-2 bg-slate-50">
              <Button variant="ghost" size="sm" className="gap-2" onClick={addRow}>
                <Plus className="w-4 h-4" />
                Add category
              </Button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Example: Dairy 3, Produce 5, Meat &amp; Poultry 4, Default 30. Items in a category use that threshold; everything else uses Default.
          </p>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                Reorder buffer (%)
                <InfoTooltip content={"Pre-warn yellow at this percentage above the reorder point.\n\n0 means yellow at reorder. 20 means yellow at 1.2 x reorder."} />
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={reorderBuffer}
                  onChange={e => setReorderBuffer(e.target.value)}
                  className="max-w-[100px] tabular-nums"
                />
                <span className="text-sm text-slate-500">%</span>
              </div>
              <p className="text-xs text-slate-500">
                {Number(reorderBuffer) === 0
                  ? "Yellow shows exactly at the reorder point."
                  : `Yellow shows at ${(1 + Number(reorderBuffer) / 100).toFixed(2)}x reorder.`}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save inventory settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
