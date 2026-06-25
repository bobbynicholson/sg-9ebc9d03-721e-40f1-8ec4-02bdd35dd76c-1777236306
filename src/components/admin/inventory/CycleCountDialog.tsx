import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, AlertCircle, CheckCircle2, ArrowDown, ArrowUp } from "lucide-react";
import { inventoryService } from "@/services/inventoryService";
import { toLocalISO } from "@/lib/localDate";

export interface CountItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  systemStock: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  performedBy: string;
  items: CountItem[];
  onSaved: (posted: number) => void;
}

export function CycleCountDialog({ open, onOpenChange, companyId, performedBy, items, onSaved }: Props) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setCategoryFilter("all");
    setSearch("");
    setCounts({});
    setNotes("");
    setConfirmStep(false);
    setError("");
  }, [open]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => set.add(i.category));
    return Array.from(set).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (categoryFilter !== "all") {
      list = list.filter(i => i.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, categoryFilter, search]);

  const enteredEntries = useMemo(() => {
    return Object.entries(counts)
      .filter(([, v]) => v !== "" && !isNaN(Number(v)))
      .map(([itemId, v]) => {
        const item = items.find(i => i.id === itemId);
        if (!item) return null;
        const counted = Number(v);
        const variance = counted - item.systemStock;
        return { item, counted, variance };
      })
      .filter(Boolean) as Array<{ item: CountItem; counted: number; variance: number }>;
  }, [counts, items]);

  const matchCount = enteredEntries.filter(e => e.variance === 0).length;
  const shortCount = enteredEntries.filter(e => e.variance < 0).length;
  const overCount = enteredEntries.filter(e => e.variance > 0).length;

  const handleProceed = () => {
    if (enteredEntries.length === 0) {
      setError("Enter a count for at least one item.");
      return;
    }
    setError("");
    setConfirmStep(true);
  };

  const handlePost = async () => {
    if (!companyId) { setError("No company on your profile."); return; }
    setSaving(true);
    setError("");
    try {
      const result = await inventoryService.cycleCount({
        companyId,
        performedBy,
        countedAt: toLocalISO(new Date()),
        notes: notes.trim() || undefined,
        entries: enteredEntries.map(e => ({ itemId: e.item.id, counted: e.counted })),
      });
      if (result.errors.length > 0 && result.posted === 0) {
        setError(`Could not post any counts. ${result.errors.join("; ")}`);
        return;
      }
      onSaved(result.posted);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Could not post the count.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-blue-600" />
            {confirmStep ? "Review and post counts" : "Cycle count"}
          </DialogTitle>
          <p className="text-sm text-slate-500">
            {confirmStep
              ? "Each variance becomes an audit-logged adjustment. This cannot be undone in bulk."
              : "Count what's actually on the shelf. Leave blank to skip an item."}
          </p>
        </DialogHeader>

        {!confirmStep ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cc_search">Search</Label>
                <Input
                  id="cc_search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter items by name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="cc_category">Category</Label>
                <select
                  id="cc_category"
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All categories</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Live summary */}
            {enteredEntries.length > 0 && (
              <div className="flex items-center gap-3 text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
                <span className="text-slate-600">
                  <span className="font-semibold text-slate-900">{enteredEntries.length}</span> counted
                </span>
                <span className="text-slate-400">·</span>
                <span className="flex items-center gap-1 text-brand-primary">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {matchCount} match
                </span>
                {shortCount > 0 && (
                  <>
                    <span className="text-slate-400">·</span>
                    <span className="flex items-center gap-1 text-red-700">
                      <ArrowDown className="w-3.5 h-3.5" />
                      {shortCount} short
                    </span>
                  </>
                )}
                {overCount > 0 && (
                  <>
                    <span className="text-slate-400">·</span>
                    <span className="flex items-center gap-1 text-blue-700">
                      <ArrowUp className="w-3.5 h-3.5" />
                      {overCount} over
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="rounded-md border border-slate-200 max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left py-2 px-3 font-semibold">Item</th>
                    <th className="text-left py-2 px-3 font-semibold">Category</th>
                    <th className="text-right py-2 px-3 font-semibold">System</th>
                    <th className="text-right py-2 px-3 font-semibold w-32">Counted</th>
                    <th className="text-right py-2 px-3 font-semibold">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                        No items match this filter.
                      </td>
                    </tr>
                  ) : filteredItems.map(item => {
                    const raw = counts[item.id] ?? "";
                    const counted = raw !== "" && !isNaN(Number(raw)) ? Number(raw) : null;
                    const variance = counted == null ? null : counted - item.systemStock;
                    const varTone =
                      variance == null ? "text-slate-300" :
                      variance === 0    ? "text-brand-primary" :
                      variance < 0      ? "text-red-700"     :
                                          "text-blue-700";
                    return (
                      <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-3 font-medium text-slate-900">{item.name}</td>
                        <td className="py-2 px-3 text-xs text-slate-600">{item.category}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                          {item.systemStock} <span className="text-slate-400 text-xs">{item.unit}</span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={raw}
                            onChange={e => setCounts(c => ({ ...c, [item.id]: e.target.value }))}
                            placeholder="-"
                            className="text-right tabular-nums h-8 text-sm"
                          />
                        </td>
                        <td className={`py-2 px-3 text-right tabular-nums font-medium ${varTone}`}>
                          {variance == null ? "-" : (variance > 0 ? `+${variance}` : variance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div>
              <Label htmlFor="cc_notes">Notes (optional)</Label>
              <Input
                id="cc_notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Monthly count by Sarah"
                className="mt-1"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-brand-primary/20 bg-brand-primary/10 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-brand-primary font-semibold">Match</p>
                <p className="text-2xl font-bold text-brand-primary">{matchCount}</p>
              </div>
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-red-700 font-semibold">Short</p>
                <p className="text-2xl font-bold text-red-900">{shortCount}</p>
              </div>
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Over</p>
                <p className="text-2xl font-bold text-blue-900">{overCount}</p>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left py-2 px-3 font-semibold">Item</th>
                    <th className="text-right py-2 px-3 font-semibold">Was</th>
                    <th className="text-right py-2 px-3 font-semibold">Counted</th>
                    <th className="text-right py-2 px-3 font-semibold">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {enteredEntries.map(({ item, counted, variance }) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="py-2 px-3 font-medium text-slate-900">{item.name}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                        {item.systemStock} <span className="text-slate-400 text-xs">{item.unit}</span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-900 font-medium">
                        {counted}
                      </td>
                      <td className={`py-2 px-3 text-right tabular-nums font-semibold ${
                        variance === 0 ? "text-brand-primary" :
                        variance < 0 ? "text-red-700" : "text-blue-700"
                      }`}>
                        {variance > 0 ? `+${variance}` : variance}
                        {variance !== 0 && (
                          <Badge variant="outline" className="ml-2 text-[10px] font-normal">
                            {variance < 0 ? "Loss" : "Gain"}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!confirmStep ? (
            <>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleProceed} disabled={enteredEntries.length === 0} className="bg-blue-600 hover:bg-blue-700">
                Review {enteredEntries.length} count{enteredEntries.length === 1 ? "" : "s"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setConfirmStep(false)} disabled={saving}>
                Back
              </Button>
              <Button onClick={handlePost} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                {saving ? "Posting..." : `Post ${enteredEntries.length} adjustment${enteredEntries.length === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
