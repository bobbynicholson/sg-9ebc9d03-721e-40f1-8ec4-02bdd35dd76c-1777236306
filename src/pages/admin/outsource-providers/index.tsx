/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/outsource-providers -- Wave 67 Phase B.
 *
 * Registry hub for the company's external per-event service providers
 * (on-site chefs, florists, photographers, sound, security, etc).
 *
 * Why separate from /admin/suppliers:
 *   - Suppliers = "we BUY GOODS from them" (ingredients, hire
 *     equipment). Inventory + procurement lens.
 *   - Outsource providers = "they FULFIL A SERVICE for an order".
 *     Per-event assignment, accept/decline flow, cost line, comms.
 *
 * Page shape mirrors /admin/suppliers so the operator's mental model
 * transfers (list of cards, search, status filter, add/edit dialog).
 * Phase C wires fulfilment to menu items. Phase D ships the per-order
 * assignment + magic-link accept flow.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  outsourceProviderService,
  COMMON_ROLES,
  RATE_TYPE_OPTIONS,
  CONTACT_CHANNEL_OPTIONS,
  type OutsourceProvider,
  type OutsourceProviderWithStats,
  type OutsourceRateType,
  type OutsourceContactChannel,
} from "@/services/outsourceProviderService";
import {
  HardHat,
  Plus,
  Search,
  Pencil,
  Trash2,
  Mail,
  Phone,
  MessageCircle,
  ExternalLink,
  Star,
  Loader2,
  Send,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface FormState {
  provider_name: string;
  contact_person: string;
  email: string;
  phone: string;
  whatsapp_number: string;
  provider_roles: string[];
  specialty: string;
  service_radius_km: string;
  default_rate_type: OutsourceRateType;
  default_rate: string;
  payment_terms_days: string;
  preferred_contact_channel: OutsourceContactChannel;
  notes: string;
}

function emptyForm(): FormState {
  return {
    provider_name: "",
    contact_person: "",
    email: "",
    phone: "",
    whatsapp_number: "",
    provider_roles: [],
    specialty: "",
    service_radius_km: "",
    default_rate_type: "per_event",
    default_rate: "",
    payment_terms_days: "",
    preferred_contact_channel: "whatsapp",
    notes: "",
  };
}

function ProvidersList() {
  const { profile } = useAuth() as any;
  const companyId = (profile as any)?.company_id;
  const { toast } = useToast();

  const [providers, setProviders] = useState<OutsourceProviderWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const [editing, setEditing] = useState<OutsourceProvider | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OutsourceProvider | null>(null);

  const load = async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await outsourceProviderService.listForCompany(companyId);
      setProviders(rows);
    } catch (e: any) {
      toast({ title: "Could not load providers", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  // Available roles for the filter = COMMON_ROLES + any custom role
  // already in use by an existing provider.
  const availableRoles = useMemo(() => {
    const set = new Set<string>(COMMON_ROLES.map((r) => r.value));
    for (const p of providers) for (const r of p.provider_roles || []) set.add(r);
    return Array.from(set).sort();
  }, [providers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return providers.filter((p) => {
      if (activeOnly && !p.is_active) return false;
      if (roleFilter !== "all" && !(p.provider_roles || []).includes(roleFilter)) return false;
      if (!q) return true;
      return (
        p.provider_name.toLowerCase().includes(q) ||
        (p.contact_person || "").toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q) ||
        (p.specialty || "").toLowerCase().includes(q) ||
        (p.provider_roles || []).some((r) => r.toLowerCase().includes(q))
      );
    });
  }, [providers, search, activeOnly, roleFilter]);

  const openAdd = () => {
    setForm(emptyForm());
    setEditing(null);
    setAdding(true);
  };

  const openEdit = (p: OutsourceProvider) => {
    setForm({
      provider_name: p.provider_name,
      contact_person: p.contact_person || "",
      email: p.email || "",
      phone: p.phone || "",
      whatsapp_number: p.whatsapp_number || "",
      provider_roles: p.provider_roles || [],
      specialty: p.specialty || "",
      service_radius_km: p.service_radius_km != null ? String(p.service_radius_km) : "",
      default_rate_type: p.default_rate_type,
      default_rate: p.default_rate != null ? String(p.default_rate) : "",
      payment_terms_days: p.payment_terms_days != null ? String(p.payment_terms_days) : "",
      preferred_contact_channel: p.preferred_contact_channel,
      notes: p.notes || "",
    });
    setEditing(p);
    setAdding(true);
  };

  const closeDialog = () => {
    setAdding(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const toggleRole = (value: string) => {
    setForm((prev) => {
      const has = prev.provider_roles.includes(value);
      return {
        ...prev,
        provider_roles: has
          ? prev.provider_roles.filter((r) => r !== value)
          : [...prev.provider_roles, value],
      };
    });
  };

  const handleSave = async () => {
    if (!companyId) return;
    if (!form.provider_name.trim()) {
      toast({ title: "Provider name required", variant: "destructive" });
      return;
    }
    if (!form.email.trim() && !form.phone.trim() && !form.whatsapp_number.trim()) {
      toast({
        title: "Need at least one contact channel",
        description: "Add an email, phone, or WhatsApp number so we can reach them.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        provider_name: form.provider_name.trim(),
        contact_person: form.contact_person.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        whatsapp_number: form.whatsapp_number.trim() || null,
        provider_roles: form.provider_roles,
        specialty: form.specialty.trim() || null,
        service_radius_km: form.service_radius_km.trim()
          ? Number(form.service_radius_km) || null
          : null,
        default_rate_type: form.default_rate_type,
        default_rate: form.default_rate.trim() ? Number(form.default_rate) || null : null,
        payment_terms_days: form.payment_terms_days.trim()
          ? parseInt(form.payment_terms_days, 10) || null
          : null,
        preferred_contact_channel: form.preferred_contact_channel,
        notes: form.notes.trim() || null,
      };

      if (editing) {
        await outsourceProviderService.update(editing.id, payload as Partial<OutsourceProvider>);
        toast({ title: "Provider updated", description: form.provider_name.trim() });
      } else {
        const created = await outsourceProviderService.create({
          companyId,
          ...payload,
        });
        if (!created) throw new Error("Could not create provider");
        toast({ title: "Provider added", description: form.provider_name.trim() });
      }
      closeDialog();
      void load();
    } catch (e: any) {
      toast({
        title: editing ? "Could not update" : "Could not create",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (p: OutsourceProvider) => {
    try {
      await outsourceProviderService.update(p.id, { is_active: !p.is_active });
      toast({ title: !p.is_active ? "Activated" : "Deactivated", description: p.provider_name });
      void load();
    } catch (e: any) {
      toast({ title: "Could not update", description: e?.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await outsourceProviderService.softDelete(deleteTarget.id);
      toast({ title: "Provider removed", description: deleteTarget.provider_name });
      setDeleteTarget(null);
      void load();
    } catch (e: any) {
      toast({ title: "Could not delete", description: e?.message, variant: "destructive" });
    }
  };

  const roleLabel = (value: string) =>
    COMMON_ROLES.find((r) => r.value === value)?.label || value.replace(/_/g, " ");

  return (
    <>
      <NoIndexMeta />
      <Head><title>Outsource providers | CateringMS</title></Head>
      <AdminNav />
      <div className="min-h-screen bg-slate-50 lg:pl-72 xl:pl-80">
        <div className="py-8 px-4 max-w-6xl">
          <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
                <HardHat className="w-7 h-7 text-blue-600" />
                Outsource providers
              </h1>
              <p className="text-slate-600 text-sm mt-1 max-w-2xl">
                Per-event service providers: on-site chefs, florists, photographers, sound, security.
                Distinct from suppliers (procurement) and staff (payroll). Each one can be assigned to an
                order with cost + accept/decline flow in Phase D.
              </p>
            </div>
            <Button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Add provider
            </Button>
          </div>

          {/* Wave 70.4 -- cron dry-run tester. Hits both outsource
              comms crons with dryRun=1 so an admin can verify the
              window logic + dedup + recipient resolution on prod
              data without sending a single email. Surfaces who
              would have been notified in the next firing window. */}
          <CronDryRunPanel />

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, contact, specialty, role..."
                className="pl-9 bg-white"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-56 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {availableRoles.map((r) => (
                  <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 px-3 py-2 bg-white border border-slate-200 rounded-md cursor-pointer">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="accent-blue-600"
              />
              Active only
            </label>
          </div>

          {/* List */}
          {loading ? (
            <Card><CardContent className="p-12 text-center text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading...
            </CardContent></Card>
          ) : providers.length === 0 ? (
            <Card className="border-2 border-dashed">
              <CardContent className="p-12 text-center">
                <HardHat className="w-14 h-14 mx-auto text-slate-300 mb-3" />
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  No outsource providers yet
                </h3>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Add the chefs, florists, sound engineers and other external parties you work with on
                  specific orders. They&apos;ll surface on menu items, quotes, and order timelines from
                  Phase C onwards.
                </p>
                <Button onClick={openAdd} className="mt-4 bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add your first provider
                </Button>
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-slate-500">
              No providers match the current filter.
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => {
                const rateLabel = RATE_TYPE_OPTIONS.find((r) => r.value === p.default_rate_type)?.label || p.default_rate_type;
                const rateDisplay = p.default_rate != null
                  ? `${p.default_currency} ${Number(p.default_rate).toLocaleString("en-ZA", { maximumFractionDigits: 2 })} ${rateLabel.toLowerCase()}`
                  : `${rateLabel}`;
                return (
                  <Card key={p.id} className={`${p.is_active ? "" : "opacity-60"} hover:shadow-sm transition`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/admin/outsource-providers/${p.id}`}
                              className="text-lg font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                            >
                              {p.provider_name}
                            </Link>
                            {!p.is_active && (
                              <Badge className="bg-slate-200 text-slate-700 text-[10px]">Inactive</Badge>
                            )}
                            {p.rating != null && (
                              <span className="inline-flex items-center gap-0.5 text-xs text-amber-700">
                                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                {Number(p.rating).toFixed(1)}
                              </span>
                            )}
                            {(p.provider_roles || []).map((r) => (
                              <Badge key={r} variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                {roleLabel(r)}
                              </Badge>
                            ))}
                          </div>
                          {p.contact_person && (
                            <p className="text-xs text-slate-600 mt-0.5">Contact: {p.contact_person}</p>
                          )}
                          {p.specialty && (
                            <p className="text-xs text-slate-600 mt-0.5">{p.specialty}</p>
                          )}
                          {/* Contact strip */}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {p.email && (
                              <a
                                href={`mailto:${p.email}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50"
                              >
                                <Mail className="w-3 h-3" />
                                {p.email}
                              </a>
                            )}
                            {p.whatsapp_number && (
                              <a
                                href={`https://wa.me/${p.whatsapp_number.replace(/[^\d]/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-green-800 bg-green-50 border border-green-200 rounded-md px-2 py-1 hover:bg-green-100"
                              >
                                <MessageCircle className="w-3 h-3" />
                                {p.whatsapp_number}
                              </a>
                            )}
                            {p.phone && (
                              <a
                                href={`tel:${p.phone.replace(/[^+\d]/g, "")}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50"
                              >
                                <Phone className="w-3 h-3" />
                                {p.phone}
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-slate-900 tabular-nums">{rateDisplay}</p>
                          {p.payment_terms_days != null && (
                            <p className="text-[11px] text-slate-500">Net {p.payment_terms_days}d</p>
                          )}
                          <p className="text-[11px] text-slate-500 mt-1">
                            Prefers {p.preferred_contact_channel}
                          </p>
                          {p.assignment_count > 0 && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {p.assignment_count} booking{p.assignment_count === 1 ? "" : "s"} on file
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleActive(p)}
                            title={p.is_active ? "Deactivate" : "Activate"}
                          >
                            {p.is_active ? "Active" : "Inactive"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(p)}
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(p)}
                            title="Remove"
                            className="text-rose-600 hover:text-rose-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Suppliers cross-link so admins find the right home for what they're entering */}
          <p className="text-[11px] text-slate-500 mt-6">
            Looking for goods suppliers (ingredients, equipment)?{" "}
            <Link href="/admin/suppliers" className="underline hover:text-slate-900">
              Open suppliers <ExternalLink className="w-2.5 h-2.5 inline-block" />
            </Link>
            .
          </p>
        </div>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={adding} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit provider" : "Add outsource provider"}</DialogTitle>
            <DialogDescription>
              These details drive the request comms + cost lines when this provider is assigned to an order.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="op-name">Provider name</Label>
                <Input
                  id="op-name"
                  value={form.provider_name}
                  onChange={(e) => setForm({ ...form, provider_name: e.target.value })}
                  placeholder="Joe's On-Site Catering"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-contact">Contact person</Label>
                <Input
                  id="op-contact"
                  value={form.contact_person}
                  onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                  placeholder="Joe Bloggs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-specialty">Specialty</Label>
                <Input
                  id="op-specialty"
                  value={form.specialty}
                  onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                  placeholder="Spit braai, fine dining"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Roles this provider can fulfil</Label>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_ROLES.map((r) => {
                  const active = form.provider_roles.includes(r.value);
                  return (
                    <button
                      type="button"
                      key={r.value}
                      onClick={() => toggleRole(r.value)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${
                        active
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500">
                Multi-select. Same provider can be both a florist and an on-site chef if they offer both.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="op-email">Email</Label>
                <Input
                  id="op-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="joe@example.co.za"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-phone">Phone</Label>
                <Input
                  id="op-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+27 82 ..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-wa">WhatsApp</Label>
                <Input
                  id="op-wa"
                  value={form.whatsapp_number}
                  onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
                  placeholder="+27 82 ... (if different)"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Preferred contact</Label>
                <Select
                  value={form.preferred_contact_channel}
                  onValueChange={(v) => setForm({ ...form, preferred_contact_channel: v as OutsourceContactChannel })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTACT_CHANNEL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-radius">Service radius (km)</Label>
                <Input
                  id="op-radius"
                  type="number"
                  min={0}
                  value={form.service_radius_km}
                  onChange={(e) => setForm({ ...form, service_radius_km: e.target.value })}
                  placeholder="60"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Default rate type</Label>
                <Select
                  value={form.default_rate_type}
                  onValueChange={(v) => setForm({ ...form, default_rate_type: v as OutsourceRateType })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RATE_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-rate">Default rate (R)</Label>
                <Input
                  id="op-rate"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.default_rate}
                  onChange={(e) => setForm({ ...form, default_rate: e.target.value })}
                  placeholder="1500"
                  disabled={form.default_rate_type === "quoted"}
                />
                {form.default_rate_type === "quoted" && (
                  <p className="text-[10px] text-slate-500">Cost negotiated per booking.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-terms">Payment terms (days)</Label>
                <Input
                  id="op-terms"
                  type="number"
                  min={0}
                  value={form.payment_terms_days}
                  onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })}
                  placeholder="Net days for their invoice"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="op-notes">Notes <span className="text-xs text-slate-400">(optional)</span></Label>
              <Textarea
                id="op-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Prefers Sundays off, has own transport, vegan-friendly..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? "Saving..." : editing ? "Save changes" : "Add provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.provider_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Soft-deletes the provider. Past assignments stay on file for the audit trail. If they come
              back into rotation later, re-add them and the history reconnects via name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Wave 70.4 -- E2E test panel for the two outsource-comms crons.
 *
 * Hits both crons with ?dryRun=1 and renders who would have been
 * emailed in the next firing window (24-36h ahead for pre-event,
 * 24-72h behind for post-event thanks). No emails go out; no
 * email_automation_log rows get written; cron auth bypassed in
 * favour of SSR owner/admin gating.
 *
 * Lets ops sanity-check the window logic + dedup on prod data
 * without committing to a real send. If the candidate set comes
 * back empty when it shouldn't (or non-empty when it shouldn't),
 * we catch it here before Vercel's cron fires the real thing
 * at the top of the hour.
 */
interface DryRunResult {
  ok?: boolean;
  dryRun?: boolean;
  windowStart?: string;
  windowEnd?: string;
  candidates?: number;
  sent?: number;
  skipped?: number;
  errors?: string[];
  preview?: Array<{ assignment_id: string; provider_email: string; order_id: string; subject: string }>;
  error?: string;
}

function CronDryRunPanel() {
  const { toast } = useToast();
  const [pre, setPre] = useState<DryRunResult | null>(null);
  const [post, setPost] = useState<DryRunResult | null>(null);
  const [busy, setBusy] = useState<"pre" | "post" | null>(null);

  const run = async (kind: "pre" | "post") => {
    setBusy(kind);
    const path = kind === "pre"
      ? "/api/cron/outsource-pre-event-reminder?dryRun=1"
      : "/api/cron/outsource-post-event-thanks?dryRun=1";
    try {
      const r = await fetch(path, { credentials: "include" });
      const data = (await r.json()) as DryRunResult;
      if (kind === "pre") setPre(data);
      else setPost(data);
      if (!r.ok) {
        toast({ title: "Dry-run failed", description: data.error || `HTTP ${r.status}`, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Dry-run failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const renderResult = (r: DryRunResult | null) => {
    if (!r) return null;
    if (r.error) {
      return <p className="text-xs text-rose-700"><AlertTriangle className="w-3 h-3 inline mr-1" />{r.error}</p>;
    }
    return (
      <div className="text-xs text-slate-700 space-y-1">
        <p>
          Window: <span className="font-mono">{r.windowStart?.slice(0, 16)}</span> &rarr; <span className="font-mono">{r.windowEnd?.slice(0, 16)}</span>
        </p>
        <p>
          Candidates in window: <span className="font-semibold">{r.candidates ?? 0}</span>. Would email: <span className="font-semibold text-emerald-700">{r.sent ?? 0}</span>. Skipped (dedup / no email): <span className="font-semibold text-slate-500">{r.skipped ?? 0}</span>.
        </p>
        {r.preview && r.preview.length > 0 && (
          <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded-md bg-white">
            <table className="w-full text-[11px]">
              <thead className="text-slate-500 bg-slate-50">
                <tr>
                  <th className="text-left px-2 py-1">Provider email</th>
                  <th className="text-left px-2 py-1">Subject</th>
                </tr>
              </thead>
              <tbody>
                {r.preview.map((p) => (
                  <tr key={p.assignment_id} className="border-t border-slate-100">
                    <td className="px-2 py-1 font-mono">{p.provider_email}</td>
                    <td className="px-2 py-1 truncate max-w-md" title={p.subject}>{p.subject}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {r.errors && r.errors.length > 0 && (
          <p className="text-rose-700 text-[11px]"><AlertTriangle className="w-3 h-3 inline mr-1" />{r.errors.length} error(s): {r.errors.slice(0, 2).join("; ")}</p>
        )}
      </div>
    );
  };

  return (
    <Card className="mb-4 border-amber-200 bg-amber-50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 inline-flex items-center gap-1.5">
              <Send className="w-4 h-4 text-amber-700" />
              Cron dry-run (no emails sent)
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              Preview who the pre-event reminder + post-event thanks crons would email on their next firing. Useful right before going live with provider comms.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => run("pre")} disabled={busy !== null} className="gap-1.5 bg-white">
              {busy === "pre" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Test pre-event (24-36h ahead)
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("post")} disabled={busy !== null} className="gap-1.5 bg-white">
              {busy === "post" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Test post-event (24-72h behind)
            </Button>
          </div>
        </div>
        {pre && (
          <div className="rounded-md bg-white border border-amber-200 p-3">
            <p className="text-xs font-semibold text-slate-900 mb-1">Pre-event reminder</p>
            {renderResult(pre)}
          </div>
        )}
        {post && (
          <div className="rounded-md bg-white border border-amber-200 p-3">
            <p className="text-xs font-semibold text-slate-900 mb-1">Post-event thanks + invoice nudge</p>
            {renderResult(post)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProtectedOutsourceProvidersPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <ProvidersList />
    </ProtectedRoute>
  );
}
