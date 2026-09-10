import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Users, Search, Plus, Loader2, Phone, Mail, MapPin, Star, Pencil, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingPageShell, SHOPPING_HERO_CHIP } from "@/components/shopping/ShoppingPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
// SUP-C: route reads + writes through the canonical service so the
// admin and team-portal surfaces stop drifting. The card UI stays
// shopper-shaped but the data plumbing is unified.
import { supplierService } from "@/services/supplierService";
import { UserRole } from "@/types/app";
import { cn } from "@/lib/utils";

interface Supplier {
  id: string;
  supplier_name: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  payment_terms: number | null;
  account_number: string | null;
  rating: number | null;
  is_active: boolean | null;
  active: boolean | null;
  notes: string | null;
  emergency_contact: string | null;
}

const blank: Partial<Supplier> = {
  supplier_name: "",
  contact_person: "",
  email: "",
  phone: "",
  address_line1: "",
  city: "",
  payment_terms: 30,
  rating: 5,
  is_active: true,
  active: true,
  notes: "",
};

function ShoppingSuppliersPageInner() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  // Command-centre restructure: a failed read used to toast and fall
  // through to "No suppliers yet", which reads as a healthy empty book.
  // Failures now render a rose recovery card with a Retry instead.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    void load();

    // Shopping persona follow-up (shopping.md 5.5): realtime refresh
    // on supplier changes. Previously the list was mount-only - a
    // supplier added on the admin side stayed invisible until the
    // shopper hard-refreshed. Per-tenant channel + company_id filter
    // matches the docs/perf-and-ops.md realtime pattern. Unique
    // per-mount suffix: a fixed channel name collides when the page
    // remounts fast (recurring realtime bug class in this repo).
    const channel = supabase
      .channel(`shopping-suppliers-${user.company_id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "suppliers",
          filter: `company_id=eq.${user.company_id}`,
        },
        () => { void load(); },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const data = await supplierService.listForCompany(user.company_id);
      setItems(data as unknown as Supplier[]);
      setLoadError(null);
      setLoaded(true);
    } catch (e: any) {
      setLoadError(e?.message || "We couldn't reach the server. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  const preFiltered = useMemo(() => {
    return showInactive ? items : items.filter((s) => s.is_active !== false);
  }, [items, showInactive]);

  const filtered = useFuzzyItems(
    preFiltered,
    search,
    [
      { key: "supplier_name" as any, weight: 3 },
      { key: "contact_person" as any, weight: 2 },
      { key: "email" as any, weight: 2 },
      { key: "city" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((s) => s.is_active !== false).length;
    const avgRating = items.filter((s) => s.rating != null).reduce((a, s, _, arr) => a + Number(s.rating || 0) / arr.length, 0);
    return { total, active, avgRating };
  }, [items]);

  const openNew = () => setEditing({ ...blank });
  const openEdit = (s: Supplier) => setEditing(s);
  const close = () => setEditing(null);

  const save = async () => {
    if (!editing || !user?.company_id || !editing.supplier_name?.trim()) {
      toast({ title: "Supplier name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const sharedPayload = {
        supplier_name: editing.supplier_name.trim(),
        email: editing.email ?? null,
        phone: editing.phone ?? null,
        contact_person: editing.contact_person ?? null,
        payment_terms: editing.payment_terms ?? null,
        address_line1: editing.address_line1 ?? null,
        address_line2: editing.address_line2 ?? null,
        city: editing.city ?? null,
        postal_code: editing.postal_code ?? null,
        notes: editing.notes ?? null,
        account_number: editing.account_number ?? null,
        rating: editing.rating ?? null,
        emergency_contact: editing.emergency_contact ?? null,
      };
      if (editing.id) {
        await supplierService.update(editing.id, {
          ...sharedPayload,
          is_active: editing.is_active !== false,
        } as never);
        toast({ title: "Supplier updated" });
      } else {
        await supplierService.create({
          companyId: user.company_id,
          ...sharedPayload,
          is_active: editing.is_active !== false,
        });
        toast({ title: "Supplier added" });
      }
      close();
      load();
    } catch (e: unknown) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof Supplier>(k: K, v: Supplier[K]) => {
    setEditing((s) => s ? { ...s, [k]: v } : s);
  };

  const showSkeleton = loading && !loaded;
  const chipsReady = loaded && !loadError;

  return (
    <>
      <ShoppingPageShell
        pageTitle="Suppliers - CateringMS"
        heading="Suppliers"
        subheading={
          chipsReady
            ? stats.total > 0
              ? `${stats.active} active supplier${stats.active === 1 ? "" : "s"} on the books${stats.total > stats.active ? `, ${stats.total - stats.active} inactive` : ""}.`
              : "No suppliers yet. Add the people you buy from to get started."
            : "Your suppliers, contacts, payment terms and ratings."
        }
        icon={Users}
        headerAction={
          <Button size="sm" onClick={openNew} className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg">
            <Plus className="h-4 w-4 mr-2" />Add supplier
          </Button>
        }
        meta={
          chipsReady ? (
            <>
              <span className={SHOPPING_HERO_CHIP}>
                <span className={cn("h-1.5 w-1.5 rounded-full", stats.active > 0 ? "bg-emerald-400" : "bg-slate-400")} />
                {stats.active} active
              </span>
              <span className={SHOPPING_HERO_CHIP}>
                <Users className="h-3 w-3" />
                {stats.total} total
              </span>
              {stats.avgRating > 0 && (
                <span className={SHOPPING_HERO_CHIP}>
                  <Star className="h-3 w-3" />
                  {stats.avgRating.toFixed(1)} avg rating
                </span>
              )}
            </>
          ) : undefined
        }
      >
        {/* Recovery card: the primary read failed. Never show the "No
            suppliers yet" empty state over a failed load. */}
        {loadError && (
          <div className="mb-6 rounded-lg border border-rose-200 bg-white p-5 shadow-sm dark:border-rose-900 dark:bg-slate-900">
            <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Couldn&apos;t load your suppliers</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{loadError}</p>
            <Button
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              className="bg-brand-primary hover:opacity-90 text-white"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin motion-reduce:animate-none")} />
              Retry
            </Button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <StatTile
            label={<span className="flex items-center gap-1">Total suppliers <InfoTooltip content="Every supplier saved against your company, whether they're active right now or not." /></span>}
            value={stats.total}
          />
          {/* Active is a positive status, so a subtle emerald value is semantic, not decoration. */}
          <StatTile
            label={<span className="flex items-center gap-1">Active <InfoTooltip content="Suppliers you're currently using.\n\nThese are the ones that show up when you're picking who to buy from." /></span>}
            value={<span className="text-brand-primary dark:text-brand-primary">{stats.active}</span>}
          />
          {/* Star is the rating glyph: amber is reserved for action + this semantic mark. */}
          <StatTile
            label={<span className="flex items-center gap-1">Avg rating <InfoTooltip content="Average rating across every supplier that has a score from 1 to 5." /></span>}
            value={<span className="flex items-center gap-1.5">{stats.avgRating.toFixed(1)}<Star className="h-5 w-5 text-amber-500 fill-amber-500" /></span>}
          />
        </div>

        <PortalCard className="mb-6">
          <PortalCardHeader title="Find a supplier" />
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <Input className="pl-9" placeholder="Search by name, contact, city..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {/* Toggle is a selection state, not a primary action: emerald
                reads "active filter on", outline reads inactive. Amber stays
                reserved for the primary Add action. */}
            <Button
              variant="outline"
              onClick={() => setShowInactive((v) => !v)}
              aria-pressed={showInactive}
              className={
                showInactive
                  ? "rounded-lg border-brand-primary/30 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/15 dark:border-brand-primary/30 dark:bg-brand-primary/10 dark:text-brand-primary dark:hover:bg-brand-primary/20"
                  : "rounded-lg"
              }
            >
              {showInactive ? "Showing inactive" : "Active only"}
            </Button>
          </div>
        </PortalCard>

        {showSkeleton ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <PortalCard key={i}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3.5 w-3/4" />
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <Skeleton className="h-5 w-12 rounded-md" />
                  <Skeleton className="h-5 w-14 rounded-md" />
                </div>
              </PortalCard>
            ))}
          </div>
        ) : loadError && items.length === 0 ? (
          /* The recovery card above owns this state; keep the body quiet. */
          <PortalCard padded={false}>
            <div className="py-10 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Your suppliers are unavailable right now. Use Retry above to reload them.
            </div>
          </PortalCard>
        ) : filtered.length === 0 ? (
          <PortalCard padded={false}>
            <div className="text-center py-16 px-6">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                <Users className="h-6 w-6 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="font-medium text-slate-900 dark:text-white">
                {search.trim() ? "No suppliers match your search" : "No suppliers yet"}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                {search.trim()
                  ? "Try a different name, contact or city, or clear the search to see everyone."
                  : "Add the people you buy from so you can track contacts, payment terms and ratings in one place."}
              </p>
              {!search.trim() && (
                <Button onClick={openNew} className="mt-4 bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg">
                  <Plus className="h-4 w-4 mr-2" />Add your first supplier
                </Button>
              )}
            </div>
          </PortalCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filtered.map((s) => (
              <PortalCard
                key={s.id}
                interactive
                onClick={() => openEdit(s)}
                role="button"
                tabIndex={0}
                aria-label={`Edit ${s.supplier_name ?? "supplier"}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openEdit(s);
                  }
                }}
                className={"group" + (!s.is_active ? " opacity-60" : "")}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">{s.supplier_name}</div>
                    {s.contact_person && <div className="text-xs text-slate-600 dark:text-slate-400 truncate">{s.contact_person}</div>}
                  </div>
                  {/* Edit affordance stays quiet until the card is hovered/focused. */}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                    aria-label={`Edit ${s.supplier_name ?? "supplier"}`}
                    className="text-slate-500 dark:text-slate-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 motion-reduce:transition-none motion-reduce:opacity-100"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                  {s.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />{s.phone}</div>}
                  {s.email && <div className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" /><span className="truncate">{s.email}</span></div>}
                  {(s.city || s.address_line1) && <div className="flex items-center gap-2 truncate"><MapPin className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" /><span className="truncate">{[s.address_line1, s.city].filter(Boolean).join(", ")}</span></div>}
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  {s.rating != null && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 text-xs tabular-nums flex items-center gap-1">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />{s.rating}/5
                    </Badge>
                  )}
                  {s.payment_terms != null && (
                    <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 text-xs tabular-nums">Net {s.payment_terms}</Badge>
                  )}
                  {!s.is_active && (
                    <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 text-xs">Inactive</Badge>
                  )}
                </div>
              </PortalCard>
            ))}
          </div>
        )}
      </ShoppingPageShell>

      <Dialog open={!!editing} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit supplier" : "New supplier"}</DialogTitle>
            <DialogDescription>Contact info, location, payment terms</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="sn">Supplier name *</Label>
                <Input id="sn" value={editing.supplier_name ?? ""} onChange={(e) => update("supplier_name", e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp">Contact person</Label>
                <Input id="cp" value={editing.contact_person ?? ""} onChange={(e) => update("contact_person", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ph">Phone</Label>
                <Input id="ph" value={editing.phone ?? ""} onChange={(e) => update("phone", e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="em">Email</Label>
                <Input id="em" type="email" value={editing.email ?? ""} onChange={(e) => update("email", e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="a1">Address</Label>
                <Input id="a1" value={editing.address_line1 ?? ""} onChange={(e) => update("address_line1", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct">City</Label>
                <Input id="ct" value={editing.city ?? ""} onChange={(e) => update("city", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc">Postal code</Label>
                <Input id="pc" value={editing.postal_code ?? ""} onChange={(e) => update("postal_code", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pt">Payment terms (days)</Label>
                <Input id="pt" type="number" min="0" value={editing.payment_terms ?? 30} onChange={(e) => update("payment_terms", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rt">Rating (1-5)</Label>
                <Input id="rt" type="number" min="1" max="5" value={editing.rating ?? 5} onChange={(e) => update("rating", Number(e.target.value))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="nt">Notes</Label>
                <Textarea id="nt" rows={2} value={editing.notes ?? ""} onChange={(e) => update("notes", e.target.value)} />
              </div>
              <div className="col-span-2 flex items-center gap-2 pt-1">
                <input type="checkbox" id="ia" checked={editing.is_active !== false} onChange={(e) => update("is_active", e.target.checked)} className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-primary accent-brand-primary focus-visible:ring-1 focus-visible:ring-ring" />
                <Label htmlFor="ia" className="cursor-pointer text-slate-700 dark:text-slate-300">Active supplier</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={saving} className="rounded-lg">Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : editing?.id ? "Save changes" : "Add supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Route guard was missing on this page pre-restructure (the nav hid it
// but the URL was open to any signed-in role). Same allow-list as the
// shopping dashboard.
export default function ShoppingSuppliersPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SHOPPING_STAFF, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.REGION_ADMIN, UserRole.ADMIN]}>
      <ShoppingSuppliersPageInner />
    </ProtectedRoute>
  );
}
