/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Suppliers hub -- list of every supplier on file with rolling spend
 * totals (30d / 90d / 365d), product counts, and a one-click compose
 * email action that uses the same Gmail / Outlook / default-mail
 * fallback chain as /admin/clients.
 *
 * Owner-level view -- only owners and admins should see commercial
 * spend numbers. Gated via ProtectedRoute.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
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
  Building2, Search, Plus, Pencil, Trash2, Mail, Phone, Globe,
  TrendingUp, Package, Calendar, Loader2, Filter, ArrowRight,
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { useToast } from "@/hooks/use-toast";
import { supplierService, type SupplierWithStats } from "@/services/supplierService";

const fmtR = (v: number | null | undefined) =>
  v == null ? "—" : `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const relativeTime = (iso: string | null) => {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 1 ? `${hours}h ago` : "just now";
};

function SuppliersList() {
  const { profile } = useAuth() as any;
  const companyId = profile?.company_id;
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<SupplierWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [editing, setEditing] = useState<SupplierWithStats | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SupplierWithStats | null>(null);

  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    const data = await supplierService.listForCompany(companyId);
    setSuppliers(data);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const q = search.toLowerCase();
    return suppliers.filter((s) => {
      if (activeOnly && s.is_active === false) return false;
      if (!q) return true;
      const hay = [
        s.supplier_name, s.email || "", s.phone || "", s.contact_person || "",
        ...(s.supplier_categories || []),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [suppliers, search, activeOnly]);

  const totals = useMemo(() => {
    const total30 = suppliers.reduce((s, x) => s + Number(x.spend_30d || 0), 0);
    const total90 = suppliers.reduce((s, x) => s + Number(x.spend_90d || 0), 0);
    const total365 = suppliers.reduce((s, x) => s + Number(x.spend_365d || 0), 0);
    const active = suppliers.filter((s) => s.is_active !== false).length;
    return { total30, total90, total365, active, all: suppliers.length };
  }, [suppliers]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>Suppliers - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 py-6 max-w-screen-2xl">

          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                  Suppliers
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Every supplier you buy from, what they sell you, and what you've spent.
                </p>
              </div>
            </div>
            <Button
              onClick={() => setAdding(true)}
              className="bg-gradient-to-r from-amber-600 to-orange-600 text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Add supplier
            </Button>
          </div>

          {/* Top stat tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatTile label="Active suppliers" value={`${totals.active} / ${totals.all}`} icon={Building2} />
            <StatTile label="Spend last 30d" value={fmtR(totals.total30)} icon={TrendingUp} accent="emerald" />
            <StatTile label="Spend last 90d" value={fmtR(totals.total90)} icon={TrendingUp} accent="emerald" />
            <StatTile label="Spend last 365d" value={fmtR(totals.total365)} icon={Calendar} />
          </div>

          {/* Filters */}
          <Card className="border-0 shadow-sm mb-4">
            <CardContent className="py-3 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[260px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by name, email, contact, category..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(e) => setActiveOnly(e.target.checked)}
                />
                Active only
              </label>
              <span className="text-xs text-slate-500 ml-auto flex items-center gap-1">
                <Filter className="w-3 h-3" />
                {visible.length} of {suppliers.length}
              </span>
            </CardContent>
          </Card>

          {/* Suppliers table */}
          <Card className="border-0 shadow-lg">
            <CardContent className="p-0">
              {loading ? (
                <div className="py-16 text-center text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading suppliers...
                </div>
              ) : visible.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <Building2 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold">No suppliers match this view.</p>
                  <p className="text-sm">Try clearing the search or filter.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-slate-50">
                      <tr>
                        <th className="text-left py-3 pl-4 pr-2">Supplier</th>
                        <th className="text-left py-3 px-2">Contact</th>
                        <th className="text-right py-3 px-2">Products</th>
                        <th className="text-right py-3 px-2">30d spend</th>
                        <th className="text-right py-3 px-2">90d spend</th>
                        <th className="text-right py-3 px-2">365d spend</th>
                        <th className="text-left py-3 px-2">Last buy</th>
                        <th className="text-right py-3 pr-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((s) => (
                        <tr key={s.id} className={`border-b border-slate-100 hover:bg-slate-50 ${s.is_active === false ? "opacity-60" : ""}`}>
                          <td className="py-3 pl-4 pr-2">
                            <Link href={`/admin/suppliers/${s.id}`} className="block group">
                              <div className="font-semibold text-slate-900 group-hover:text-amber-600 inline-flex items-center gap-1.5">
                                {s.supplier_name}
                                <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                              {(s.supplier_categories || []).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {(s.supplier_categories || []).slice(0, 3).map((c) => (
                                    <Badge key={c} variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                                      {c}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {s.is_active === false && (
                                <Badge variant="outline" className="mt-1 text-[10px] bg-rose-50 text-rose-700 border-rose-200">Inactive</Badge>
                              )}
                            </Link>
                          </td>
                          <td className="py-3 px-2 text-xs text-slate-600">
                            {s.contact_person && <div className="text-slate-900">{s.contact_person}</div>}
                            {s.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="w-3 h-3" /> {s.email}
                              </div>
                            )}
                            {s.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {s.phone}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2 text-right tabular-nums">
                            {s.product_count > 0 ? (
                              <span className="inline-flex items-center gap-1 text-slate-700">
                                <Package className="w-3 h-3 text-slate-400" />
                                {s.product_count}
                              </span>
                            ) : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="py-3 px-2 text-right tabular-nums">{s.spend_30d > 0 ? fmtR(s.spend_30d) : "—"}</td>
                          <td className="py-3 px-2 text-right tabular-nums">{s.spend_90d > 0 ? fmtR(s.spend_90d) : "—"}</td>
                          <td className="py-3 px-2 text-right tabular-nums font-semibold">{s.spend_365d > 0 ? fmtR(s.spend_365d) : "—"}</td>
                          <td className="py-3 px-2 text-xs text-slate-500">{relativeTime(s.last_purchase_at)}</td>
                          <td className="py-3 pr-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => setEditing(s)}
                                aria-label={`Edit ${s.supplier_name}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                                onClick={() => setConfirmDelete(s)}
                                aria-label={`Delete ${s.supplier_name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <SupplierFormDialog
        open={adding || !!editing}
        editing={editing}
        companyId={companyId}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSaved={() => { setAdding(false); setEditing(null); reload(); }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.supplier_name} will be hidden. Their products keep the link but the
              supplier won't show in shopping lists. Receipts and stock-in transactions stay on file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={async () => {
                const s = confirmDelete;
                if (!s) return;
                try {
                  await supplierService.softDelete(s.id);
                  toast({ title: "Supplier deleted" });
                  setConfirmDelete(null);
                  reload();
                } catch (e: any) {
                  toast({ title: "Couldn't delete", description: e?.message, variant: "destructive" });
                }
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

function StatTile({
  label, value, icon: Icon, accent = "slate",
}: { label: string; value: string; icon: typeof TrendingUp; accent?: "slate" | "emerald" }) {
  const accentClass = accent === "emerald" ? "text-emerald-600" : "text-slate-700";
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <Icon className={`w-4 h-4 ${accentClass}`} />
        </div>
        <p className={`text-xl font-bold ${accentClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SupplierFormDialog({
  open, editing, companyId, onClose, onSaved,
}: {
  open: boolean;
  editing: SupplierWithStats | null;
  companyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    supplier_name: "", email: "", phone: "", contact_person: "",
    payment_terms: "", payment_method: "eft",
    preferred_contact_method: "email",
    website: "",
    address_line1: "", address_line2: "", city: "", postal_code: "",
    notes: "",
    supplier_categories_text: "",
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        supplier_name: editing.supplier_name || "",
        email: editing.email || "",
        phone: editing.phone || "",
        contact_person: editing.contact_person || "",
        payment_terms: editing.payment_terms || "",
        payment_method: (editing.payment_method as string) || "eft",
        preferred_contact_method: (editing.preferred_contact_method as string) || "email",
        website: (editing.website as string) || "",
        address_line1: editing.address_line1 || "",
        address_line2: editing.address_line2 || "",
        city: editing.city || "",
        postal_code: editing.postal_code || "",
        notes: editing.notes || "",
        supplier_categories_text: ((editing.supplier_categories as string[]) || []).join(", "),
      });
    } else {
      setForm({
        supplier_name: "", email: "", phone: "", contact_person: "",
        payment_terms: "", payment_method: "eft",
        preferred_contact_method: "email", website: "",
        address_line1: "", address_line2: "", city: "", postal_code: "",
        notes: "", supplier_categories_text: "",
      });
    }
  }, [open, editing]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.supplier_name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const categories = form.supplier_categories_text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (editing) {
        await supplierService.update(editing.id, {
          supplier_name: form.supplier_name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          contact_person: form.contact_person.trim() || null,
          payment_terms: form.payment_terms.trim() || null,
          payment_method: form.payment_method || null,
          preferred_contact_method: form.preferred_contact_method,
          website: form.website.trim() || null,
          address_line1: form.address_line1.trim() || null,
          address_line2: form.address_line2.trim() || null,
          city: form.city.trim() || null,
          postal_code: form.postal_code.trim() || null,
          notes: form.notes.trim() || null,
          supplier_categories: categories,
        } as any);
      } else {
        await supplierService.create({
          companyId,
          supplier_name: form.supplier_name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          contact_person: form.contact_person.trim() || null,
          payment_terms: form.payment_terms.trim() || null,
          payment_method: form.payment_method || null,
          preferred_contact_method: form.preferred_contact_method,
          website: form.website.trim() || null,
          address_line1: form.address_line1.trim() || null,
          address_line2: form.address_line2.trim() || null,
          city: form.city.trim() || null,
          postal_code: form.postal_code.trim() || null,
          notes: form.notes.trim() || null,
          supplier_categories: categories,
        });
      }
      toast({ title: editing ? "Supplier updated" : "Supplier added" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit supplier" : "Add supplier"}</DialogTitle>
          <DialogDescription>
            Capture the contact, payment + delivery info. Categories help group suppliers
            on the list (e.g. Meat, Dry goods, Equipment).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Supplier name</label>
            <Input value={form.supplier_name} onChange={(e) => set("supplier_name", e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Contact person</label>
              <Input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Email</label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Phone</label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Website</label>
              <Input value={form.website} onChange={(e) => set("website", e.target.value)} className="mt-1" placeholder="https://" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Preferred contact method</label>
              <select
                value={form.preferred_contact_method}
                onChange={(e) => set("preferred_contact_method", e.target.value)}
                className="mt-1 w-full text-sm rounded-md border border-slate-200 px-3 py-2 bg-white"
              >
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="in_person">In person</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Payment method</label>
              <select
                value={form.payment_method}
                onChange={(e) => set("payment_method", e.target.value)}
                className="mt-1 w-full text-sm rounded-md border border-slate-200 px-3 py-2 bg-white"
              >
                <option value="eft">EFT</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="account">On account</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Payment terms</label>
              <Input value={form.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} className="mt-1" placeholder="e.g. 30 days, COD" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Categories (comma-separated)</label>
              <Input value={form.supplier_categories_text} onChange={(e) => set("supplier_categories_text", e.target.value)} className="mt-1" placeholder="e.g. Meat, Dry goods" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} placeholder="Address line 1" />
            <Input value={form.address_line2} onChange={(e) => set("address_line2", e.target.value)} placeholder="Address line 2" />
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="City" />
            <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} placeholder="Postal code" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Notes</label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="mt-1" placeholder="Account number, delivery rhythm, anything worth remembering..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-to-r from-amber-600 to-orange-600 text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            {editing ? "Save changes" : "Add supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SuppliersPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <SuppliersList />
    </ProtectedRoute>
  );
}
