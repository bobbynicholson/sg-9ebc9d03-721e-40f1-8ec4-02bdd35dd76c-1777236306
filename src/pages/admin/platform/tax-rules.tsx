/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Platform admin: edit the SA SARS deductibility rules used by the
 * slip scanner's AI to classify line items.
 *
 * The table is global (no company_id) - one set of rules for the whole
 * platform. Only super_admins land here, gated by ProtectedRoute.
 *
 * Schema reference: see migration
 *   supabase/migrations/20260501170000_sa_tax_deductibility_rules.sql
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { PortalShell, PortalHeader, PortalCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, Plus, Pencil, Trash2, Sparkles, Filter, Save, Loader2,
  Tag, ShieldCheck, ShieldAlert, ShieldX,
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

interface TaxRule {
  id: string;
  category_code: string;
  display_name: string;
  group_label: string;
  deductibility: "deductible" | "partial" | "non_deductible";
  vat_input_claimable: "claimable" | "not_claimable" | "depends";
  treatment: "expense" | "capital" | "mixed" | "non_allowed";
  capital_threshold_rand: number | null;
  match_keywords: string[];
  example_items: string[];
  legal_reference: string | null;
  notes: string | null;
  display_order: number;
  is_active: boolean;
}

const DEDUCT_TONE: Record<TaxRule["deductibility"], string> = {
  deductible: "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
  partial: "bg-amber-100 text-amber-700 border-amber-200",
  non_deductible: "bg-rose-100 text-rose-700 border-rose-200",
};

const DEDUCT_ICON: Record<TaxRule["deductibility"], typeof ShieldCheck> = {
  deductible: ShieldCheck,
  partial: ShieldAlert,
  non_deductible: ShieldX,
};

const EMPTY_RULE: Omit<TaxRule, "id"> = {
  category_code: "",
  display_name: "",
  group_label: "Operations",
  deductibility: "deductible",
  vat_input_claimable: "claimable",
  treatment: "expense",
  capital_threshold_rand: null,
  match_keywords: [],
  example_items: [],
  legal_reference: null,
  notes: null,
  display_order: 100,
  is_active: true,
};

function TaxRulesAdmin() {
  const { toast } = useToast();
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [editing, setEditing] = useState<TaxRule | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TaxRule | null>(null);

  const reload = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sa_tax_deductibility_rules")
      .select("*")
      .order("display_order", { ascending: true });
    if (error) {
      toast({ title: "Couldn't load rules", description: dbErrorMessage(error, { entity: "tax rule" }), variant: "destructive" });
    }
    setRules((data || []) as unknown as TaxRule[]);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const groups = useMemo(() => {
    const set = new Set<string>();
    rules.forEach((r) => set.add(r.group_label));
    return ["all", ...Array.from(set).sort()];
  }, [rules]);

  const visible = useMemo(() => {
    const q = search.toLowerCase();
    return rules.filter((r) => {
      if (filterGroup !== "all" && r.group_label !== filterGroup) return false;
      if (!q) return true;
      const hay = [
        r.display_name, r.category_code, r.group_label, r.legal_reference || "",
        ...(r.match_keywords || []),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rules, search, filterGroup]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>SA tax rules - CateringMS</title></Head>

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            title="SA Tax Rules"
            subtitle="Reference rules the slip scanner uses to classify line items as deductible or not. Global to all tenants. Edit with care."
            icon={Sparkles}
            actions={
              <Button
                onClick={() => setAdding(true)}
                className="bg-gradient-to-r from-brand-primary to-brand-secondary text-white"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Add rule
              </Button>
            }
          />

          {/* Filters */}
          <PortalCard className="mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[260px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by name, keyword, code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={filterGroup}
                  onChange={(e) => setFilterGroup(e.target.value)}
                  className="text-sm rounded-md border border-slate-200 px-3 py-2 bg-white"
                >
                  {groups.map((g) => (
                    <option key={g} value={g}>{g === "all" ? "All groups" : g}</option>
                  ))}
                </select>
              </div>
              <span className="text-xs text-slate-500 ml-auto">
                {visible.length} of {rules.length} rules
              </span>
            </div>
          </PortalCard>

          {/* Rules table */}
          <PortalCard padded={false}>
            <div className="p-0">
              {loading ? (
                <div className="py-16 text-center text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading rules...
                </div>
              ) : visible.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <Tag className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold">No rules match this view.</p>
                  <p className="text-sm">Try clearing the search or filter.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-slate-50">
                      <tr>
                        <th className="text-left py-3 pl-4 pr-2">Rule</th>
                        <th className="text-left py-3 px-2">Group</th>
                        <th className="text-left py-3 px-2">Deductibility</th>
                        <th className="text-left py-3 px-2">VAT</th>
                        <th className="text-left py-3 px-2">Treatment</th>
                        <th className="text-left py-3 px-2">Keywords</th>
                        <th className="text-right py-3 pr-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => {
                        const Icon = DEDUCT_ICON[r.deductibility];
                        return (
                          <tr key={r.id} className={`border-b border-slate-100 ${r.is_active ? "" : "opacity-60 bg-slate-50/40"}`}>
                            <td className="py-3 pl-4 pr-2">
                              <div className="font-semibold text-slate-900">{r.display_name}</div>
                              <div className="text-[11px] text-slate-500 font-mono">{r.category_code}</div>
                              {!r.is_active && (
                                <Badge variant="outline" className="mt-1 text-[10px]">Inactive</Badge>
                              )}
                            </td>
                            <td className="py-3 px-2 text-slate-700">{r.group_label}</td>
                            <td className="py-3 px-2">
                              <Badge variant="outline" className={`${DEDUCT_TONE[r.deductibility]} border gap-1 text-[11px]`}>
                                <Icon className="w-3 h-3" />
                                {r.deductibility}
                              </Badge>
                            </td>
                            <td className="py-3 px-2 text-xs text-slate-700">{r.vat_input_claimable}</td>
                            <td className="py-3 px-2 text-xs text-slate-700">
                              {r.treatment}
                              {r.capital_threshold_rand != null && (
                                <div className="text-[10px] text-slate-500">@ ZAR {r.capital_threshold_rand}</div>
                              )}
                            </td>
                            <td className="py-3 px-2 text-xs text-slate-500">
                              {(r.match_keywords || []).slice(0, 4).join(", ")}
                              {(r.match_keywords || []).length > 4 && (
                                <span className="text-slate-400"> +{r.match_keywords.length - 4}</span>
                              )}
                            </td>
                            <td className="py-3 pr-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => setEditing(r)}
                                  aria-label="Edit"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                                  onClick={() => setConfirmDelete(r)}
                                  aria-label="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </PortalCard>
        </PortalShell>
      </div>

      {/* Edit / Add dialog */}
      <RuleFormDialog
        open={adding || !!editing}
        editing={editing}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSaved={() => { setAdding(false); setEditing(null); reload(); }}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.display_name}. The slip scanner will stop using it. Existing receipts that
              were tagged against this rule will keep their tags but lose the link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={async () => {
                const r = confirmDelete;
                if (!r) return;
                const { error } = await supabase
                  .from("sa_tax_deductibility_rules")
                  .delete()
                  .eq("id", r.id);
                setConfirmDelete(null);
                if (error) {
                  toast({ title: "Couldn't delete", description: dbErrorMessage(error, { entity: "tax rule" }), variant: "destructive" });
                  return;
                }
                toast({ title: "Rule deleted" });
                reload();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RuleFormDialog({
  open, editing, onClose, onSaved,
}: {
  open: boolean;
  editing: TaxRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Omit<TaxRule, "id">>(EMPTY_RULE);
  const [keywordsText, setKeywordsText] = useState("");
  const [examplesText, setExamplesText] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        category_code: editing.category_code,
        display_name: editing.display_name,
        group_label: editing.group_label,
        deductibility: editing.deductibility,
        vat_input_claimable: editing.vat_input_claimable,
        treatment: editing.treatment,
        capital_threshold_rand: editing.capital_threshold_rand,
        match_keywords: editing.match_keywords || [],
        example_items: editing.example_items || [],
        legal_reference: editing.legal_reference,
        notes: editing.notes,
        display_order: editing.display_order,
        is_active: editing.is_active,
      });
      setKeywordsText((editing.match_keywords || []).join(", "));
      setExamplesText((editing.example_items || []).join(", "));
    } else {
      setForm(EMPTY_RULE);
      setKeywordsText("");
      setExamplesText("");
    }
  }, [open, editing]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.category_code.trim() || !form.display_name.trim() || !form.group_label.trim()) {
      toast({ title: "Missing required fields", description: "Code, name and group are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      ...form,
      category_code: form.category_code.trim(),
      display_name: form.display_name.trim(),
      group_label: form.group_label.trim(),
      match_keywords: keywordsText.split(",").map((s) => s.trim()).filter(Boolean),
      example_items: examplesText.split(",").map((s) => s.trim()).filter(Boolean),
      legal_reference: form.legal_reference?.trim() || null,
      notes: form.notes?.trim() || null,
      capital_threshold_rand: form.capital_threshold_rand
        ? Number(form.capital_threshold_rand)
        : null,
    };
    let error: any = null;
    if (editing) {
      ({ error } = await supabase
        .from("sa_tax_deductibility_rules")
        .update(payload)
        .eq("id", editing.id));
    } else {
      ({ error } = await supabase
        .from("sa_tax_deductibility_rules")
        .insert(payload));
    }
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: dbErrorMessage(error, { entity: "tax rule" }), variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Rule updated" : "Rule added" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit rule" : "Add rule"}</DialogTitle>
          <DialogDescription>
            Keywords drive the AI's match. Add the words you actually see on SA till slips
            for this kind of expense.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Display name</label>
              <Input value={form.display_name} onChange={(e) => set("display_name", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Category code (slug)</label>
              <Input
                value={form.category_code}
                onChange={(e) => set("category_code", e.target.value.replace(/[^a-z0-9_]/g, "_").toLowerCase())}
                className="mt-1 font-mono"
                placeholder="e.g. ingredients_meat"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Group</label>
              <Input value={form.group_label} onChange={(e) => set("group_label", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Display order</label>
              <Input
                type="number"
                value={form.display_order}
                onChange={(e) => set("display_order", Number(e.target.value) || 100)}
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => set("is_active", e.target.checked)}
                />
                Active
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Deductibility</label>
              <select
                value={form.deductibility}
                onChange={(e) => set("deductibility", e.target.value as any)}
                className="mt-1 w-full text-sm rounded-md border border-slate-200 px-3 py-2 bg-white"
              >
                <option value="deductible">Deductible</option>
                <option value="partial">Partial</option>
                <option value="non_deductible">Non-deductible</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">VAT input</label>
              <select
                value={form.vat_input_claimable}
                onChange={(e) => set("vat_input_claimable", e.target.value as any)}
                className="mt-1 w-full text-sm rounded-md border border-slate-200 px-3 py-2 bg-white"
              >
                <option value="claimable">Claimable</option>
                <option value="not_claimable">Not claimable</option>
                <option value="depends">Depends</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Treatment</label>
              <select
                value={form.treatment}
                onChange={(e) => set("treatment", e.target.value as any)}
                className="mt-1 w-full text-sm rounded-md border border-slate-200 px-3 py-2 bg-white"
              >
                <option value="expense">Expense (immediate)</option>
                <option value="capital">Capital (depreciate)</option>
                <option value="mixed">Mixed</option>
                <option value="non_allowed">Non-allowed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Capital threshold (R), optional
            </label>
            <Input
              type="number"
              value={form.capital_threshold_rand ?? ""}
              onChange={(e) => set("capital_threshold_rand", e.target.value ? Number(e.target.value) : null)}
              placeholder="e.g. 7000"
              className="mt-1"
            />
            <p className="text-[11px] text-slate-500 mt-0.5">
              Items above this value are capital (depreciated); below are written off immediately. Set per BGR 7 (R7,000).
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Match keywords (comma-separated)</label>
            <Textarea
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              rows={2}
              className="mt-1 font-mono text-xs"
              placeholder="beef, chicken, lamb, pork, mince"
            />
            <p className="text-[11px] text-slate-500 mt-0.5">The AI uses these to match line items against this rule.</p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Example items (comma-separated)</label>
            <Textarea
              value={examplesText}
              onChange={(e) => setExamplesText(e.target.value)}
              rows={2}
              className="mt-1 text-xs"
              placeholder="Beef mince, Chicken thighs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Legal reference</label>
              <Input
                value={form.legal_reference || ""}
                onChange={(e) => set("legal_reference", e.target.value)}
                placeholder="e.g. ITA s11(a)"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Notes</label>
            <Textarea
              value={form.notes || ""}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="mt-1"
              placeholder="Caveats, apportionment rules, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-to-r from-brand-primary to-brand-secondary text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            {editing ? "Save changes" : "Add rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TaxRulesPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <TaxRulesAdmin />
    </ProtectedRoute>
  );
}
