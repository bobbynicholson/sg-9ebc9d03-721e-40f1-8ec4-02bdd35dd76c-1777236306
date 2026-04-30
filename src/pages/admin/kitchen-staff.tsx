/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserRole } from "@/types/app";
import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChefHat, UserPlus, Pencil, Archive, ArchiveRestore, Search, Phone, Mail,
  DollarSign, Clock, AlertTriangle, ExternalLink,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  kitchenStaffService,
  effectiveOvertimeRate,
  type KitchenStaffMember,
} from "@/services/kitchenStaffService";

const ROLE_TITLES = ["Chef", "Sous Chef", "Prep", "Cook", "Cold Prep", "Pack", "Plate", "Waiter", "Cleaning", "Shopping", "Other"];

interface DraftStaff {
  full_name: string;
  role_title: string;
  phone: string;
  email: string;
  hourly_rate: string;          // text inputs -- parsed on submit
  overtime_rate: string;
  standard_hours_per_day: string;
  notes: string;
}

const EMPTY_DRAFT: DraftStaff = {
  full_name: "",
  role_title: "Chef",
  phone: "",
  email: "",
  hourly_rate: "",
  overtime_rate: "",
  standard_hours_per_day: "9",
  notes: "",
};

function KitchenStaffPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<KitchenStaffMember[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<KitchenStaffMember | null>(null);
  const [draft, setDraft] = useState<DraftStaff>(EMPTY_DRAFT);
  const [error, setError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<KitchenStaffMember | null>(null);

  const companyId = (profile as any)?.company_id as string | undefined;

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const list = await kitchenStaffService.listStaffWithRates(companyId, /* includeArchived */ true);
      setStaff(list);
    } catch (e: any) {
      toast({ title: "Could not load staff", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  // Filtered view -- search + archived toggle
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return staff
      .filter(s => showArchived ? true : s.is_active && !s.deleted_at)
      .filter(s => !term
        || s.full_name.toLowerCase().includes(term)
        || (s.role_title || "").toLowerCase().includes(term)
        || (s.phone || "").toLowerCase().includes(term)
      );
  }, [staff, search, showArchived]);

  // Headline stats: how many on the books, how many missing rates (a real
  // gap because the wage dashboard can't compute earnings without them).
  const stats = useMemo(() => {
    const active = staff.filter(s => s.is_active && !s.deleted_at);
    const missingRate = active.filter(s => s.hourly_rate == null).length;
    return {
      total: active.length,
      missingRate,
    };
  }, [staff]);

  const openAdd = () => {
    setEditTarget(null);
    setDraft(EMPTY_DRAFT);
    setError("");
    setDialogOpen(true);
  };

  const openEdit = (s: KitchenStaffMember) => {
    setEditTarget(s);
    setDraft({
      full_name: s.full_name || "",
      role_title: s.role_title || "Chef",
      phone: s.phone || "",
      email: s.email || "",
      hourly_rate: s.hourly_rate != null ? String(s.hourly_rate) : "",
      overtime_rate: s.overtime_rate != null ? String(s.overtime_rate) : "",
      standard_hours_per_day: String(s.standard_hours_per_day ?? 9),
      notes: s.notes || "",
    });
    setError("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!companyId) return;
    setError("");
    if (!draft.full_name.trim()) {
      setError("Full name is required");
      return;
    }
    const rate = draft.hourly_rate.trim() ? Number(draft.hourly_rate) : null;
    const otRate = draft.overtime_rate.trim() ? Number(draft.overtime_rate) : null;
    const stdHours = draft.standard_hours_per_day.trim() ? Number(draft.standard_hours_per_day) : 9;
    if (rate != null && (isNaN(rate) || rate < 0)) {
      setError("Hourly rate must be a positive number");
      return;
    }
    if (otRate != null && (isNaN(otRate) || otRate < 0)) {
      setError("Overtime rate must be a positive number");
      return;
    }
    if (isNaN(stdHours) || stdHours < 0 || stdHours > 24) {
      setError("Standard hours per day must be between 0 and 24");
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        company_id: companyId,
        full_name: draft.full_name.trim(),
        role_title: draft.role_title || null,
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
        hourly_rate: rate,
        overtime_rate: otRate,
        standard_hours_per_day: stdHours,
        notes: draft.notes.trim() || null,
        is_active: true,
      };
      if (editTarget) payload.id = editTarget.id;

      await kitchenStaffService.upsertStaff(payload);
      toast({
        title: editTarget ? "Staff updated" : "Staff added",
        description: draft.full_name,
      });
      setDialogOpen(false);
      load();
    } catch (e: any) {
      setError(e?.message || "Could not save -- check your inputs.");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setSaving(true);
    try {
      await kitchenStaffService.archiveStaff(archiveTarget.id);
      toast({ title: "Staff archived", description: archiveTarget.full_name });
      setArchiveTarget(null);
      load();
    } catch (e: any) {
      toast({ title: "Could not archive", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (s: KitchenStaffMember) => {
    setSaving(true);
    try {
      await kitchenStaffService.upsertStaff({
        id: s.id,
        company_id: s.company_id,
        full_name: s.full_name,
        is_active: true,
        deleted_at: null,
      } as any);
      toast({ title: "Restored", description: s.full_name });
      load();
    } catch (e: any) {
      toast({ title: "Could not restore", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
      <Head><title>Kitchen Staff -- CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-screen-2xl">

          {/* Header */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <ChefHat className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
                  Kitchen Staff
                  <InfoTooltip content="Add the people working in your kitchen, set their rates and standard daily hours.\n\nThe kitchen tablet board shows their tiles -- one tap to clock them in, one to clock out.\n\nRates and wages stay on this and the wage dashboard. The kitchen surface never sees them." />
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Add staff, set hourly + overtime rates, choose the standard daily hours.
                </p>
              </div>
            </div>
            <Button onClick={openAdd} className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600">
              <UserPlus className="w-4 h-4 mr-2" />
              Add staff
            </Button>
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Active staff</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{stats.total}</p>
              </CardContent>
            </Card>
            <Card className={`border-0 shadow-sm ${stats.missingRate > 0 ? "bg-amber-50" : ""}`}>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                  Missing rate
                  {stats.missingRate > 0 && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                </p>
                <p className={`text-2xl font-bold tabular-nums ${stats.missingRate > 0 ? "text-amber-700" : "text-slate-900"}`}>
                  {stats.missingRate}
                </p>
                {stats.missingRate > 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">Wage dashboard skips staff without rates</p>
                )}
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Wage dashboard</p>
                  <p className="text-sm font-medium text-slate-700">Hours x rates roll-up</p>
                </div>
                <Link href="/admin/wages" className="text-orange-600 hover:text-orange-700 inline-flex items-center gap-1 text-sm font-medium">
                  Open <ExternalLink className="w-3 h-3" />
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Search + archived toggle */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, role or phone..."
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 px-3 rounded-md border border-slate-200 bg-white">
              <Switch id="archived" checked={showArchived} onCheckedChange={setShowArchived} />
              <Label htmlFor="archived" className="text-sm text-slate-700 cursor-pointer select-none">Show archived</Label>
            </div>
          </div>

          {/* Staff list */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-12 text-slate-500 text-sm">Loading staff...</div>
              ) : visible.length === 0 ? (
                <div className="text-center py-12">
                  <ChefHat className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-700 font-medium">{staff.length === 0 ? "No staff yet" : "No matches"}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {staff.length === 0
                      ? "Add your first kitchen staff member to start tracking hours."
                      : "Try a different search or toggle archived staff."}
                  </p>
                  {staff.length === 0 && (
                    <Button className="mt-4" onClick={openAdd}>
                      <UserPlus className="w-4 h-4 mr-2" />Add your first staffer
                    </Button>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {visible.map((s) => {
                    const otRate = effectiveOvertimeRate(s);
                    const archived = !s.is_active || !!s.deleted_at;
                    return (
                      <li key={s.id} className={`p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${archived ? "opacity-60" : ""}`}>
                        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                          <ChefHat className="w-5 h-5 text-orange-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900 truncate">{s.full_name}</span>
                            {s.role_title && <Badge variant="outline" className="text-[10px]">{s.role_title}</Badge>}
                            {archived && <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-500">Archived</Badge>}
                            {s.linked_profile_id && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Logs in</Badge>}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            {s.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                            {s.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{s.email}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <div className="text-right">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">Standard</div>
                            <div className="font-semibold text-slate-900 tabular-nums">
                              {s.hourly_rate != null ? `R ${Number(s.hourly_rate).toFixed(2)}/h` : <span className="text-amber-600">Not set</span>}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">Overtime</div>
                            <div className="font-semibold text-slate-900 tabular-nums">
                              {otRate != null ? `R ${otRate.toFixed(2)}/h` : "--"}
                            </div>
                          </div>
                          <div className="text-right hidden sm:block">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">Std day</div>
                            <div className="font-semibold text-slate-900 tabular-nums">{s.standard_hours_per_day}h</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                            <Pencil className="w-3 h-3 mr-1" />Edit
                          </Button>
                          {archived ? (
                            <Button variant="outline" size="sm" onClick={() => handleRestore(s)} disabled={saving}>
                              <ArchiveRestore className="w-3 h-3 mr-1" />Restore
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => setArchiveTarget(s)} className="text-red-700 border-red-200 hover:bg-red-50">
                              <Archive className="w-3 h-3 mr-1" />Archive
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Footer />
      </main>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit staff" : "Add staff"}</DialogTitle>
            <DialogDescription>
              Rates only show on this page and the wage dashboard. The kitchen tablet sees names and on-duty status, never rand values.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Full name *</Label>
              <Input
                value={draft.full_name}
                onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                placeholder="e.g. Sipho Khumalo"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                value={draft.role_title}
                onChange={(e) => setDraft({ ...draft, role_title: e.target.value })}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                {ROLE_TITLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="+27 ..."
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Email (optional)</Label>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                placeholder="staff@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" />Hourly rate (R)
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={draft.hourly_rate}
                onChange={(e) => setDraft({ ...draft, hourly_rate: e.target.value })}
                placeholder="80"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" />Overtime rate (R)
                <InfoTooltip content="Optional. Leave blank for the SA default of 1.5x the hourly rate (BCEA ordinary overtime)." />
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={draft.overtime_rate}
                onChange={(e) => setDraft({ ...draft, overtime_rate: e.target.value })}
                placeholder="1.5x rate if blank"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="flex items-center gap-1">
                <Clock className="w-3 h-3" />Standard hours per day
                <InfoTooltip content="Anything worked above this in a single day is logged as overtime. SA default is 9 hours per the BCEA." />
              </Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={draft.standard_hours_per_day}
                onChange={(e) => setDraft({ ...draft, standard_hours_per_day: e.target.value })}
                placeholder="9"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes (optional)</Label>
              <Textarea
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Allergies, certifications, anything worth remembering"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700">
              {saving ? "Saving..." : editTarget ? "Save changes" : "Add staff"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiveTarget?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll disappear from the kitchen tablet but their shift history stays on the wage dashboard. You can restore them anytime by toggling "Show archived".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} className="bg-red-600 hover:bg-red-700">Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProtectedRoute>
  );
}

export default KitchenStaffPage;
