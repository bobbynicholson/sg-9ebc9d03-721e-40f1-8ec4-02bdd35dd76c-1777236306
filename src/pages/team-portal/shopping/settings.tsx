import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, Save, Loader2, Users, Lock } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingPageShell, SHOPPING_HERO_CHIP } from "@/components/shopping/ShoppingPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalCard, PortalCardHeader } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/app";
import {
  ShoppingSettings,
  SHOPPING_SETTINGS_DEFAULTS,
  getShoppingSettings,
  saveShoppingSettings,
} from "@/services/shopping/shoppingSettingsService";

/** Roles allowed to WRITE settings. MUST match the company_shopping_settings
 *  INSERT/UPDATE RLS, which allows only owner/company_admin/admin/super_admin
 *  (migration 20260705130000). REGION_ADMIN was here but is NOT in the RLS, so
 *  it got an editable form + Save button whose upsert RLS silently rejected -
 *  "Could not save", changes lost. Everyone else gets a read-only view. */
const EDITOR_ROLES = new Set<string>([
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.COMPANY_ADMIN,
  UserRole.ADMIN,
]);

/** Settings that have no server-side consumer yet - shown but disabled so
 *  they never masquerade as live controls. Wired progressively as the
 *  background jobs (auto-create cron, supplier ranking, low-stock
 *  notifier) land. */
const COMING_SOON_NOTE = "Persisted for your team. This becomes active once its background job ships - it does nothing yet, so it is disabled to avoid a control that looks live but isn't.";

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function ShoppingSettingsPageInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const companyId = (user as { company_id?: string } | null)?.company_id ?? null;
  const userId = (user as { id?: string } | null)?.id ?? null;
  const role = (user as { role?: string; active_role?: string } | null);
  const canEdit = EDITOR_ROLES.has(role?.active_role || role?.role || "");

  const [settings, setSettings] = useState<ShoppingSettings>(SHOPPING_SETTINGS_DEFAULTS);
  const [savedSnapshot, setSavedSnapshot] = useState<ShoppingSettings>(SHOPPING_SETTINGS_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);

  // Skip echoing our own save back through the realtime handler.
  const savingRef = useRef(false);

  const resolveEditorName = useCallback(async (uid: string | null) => {
    if (!uid) { setUpdatedByName(null); return; }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("profiles").select("full_name").eq("id", uid).maybeSingle();
      setUpdatedByName(data?.full_name ?? null);
    } catch { setUpdatedByName(null); }
  }, []);

  const load = useCallback(async () => {
    if (!companyId) { setLoaded(true); return; }
    const res = await getShoppingSettings(supabase, companyId);
    setSettings(res.settings);
    setSavedSnapshot(res.settings);
    setUpdatedAt(res.meta.updatedAt);
    setTableMissing(res.tableMissing);
    void resolveEditorName(res.meta.updatedByUserId);
    setLoaded(true);
  }, [companyId, resolveEditorName]);

  useEffect(() => { void load(); }, [load]);

  // Realtime: when a teammate saves, pull the new values live so this
  // page never shows a stale policy. Random channel suffix per the
  // repo's channel-reuse rule (see useActiveShoppingList).
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`shopping-settings-${companyId}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "company_shopping_settings", filter: `company_id=eq.${companyId}` },
        () => { if (!savingRef.current) void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [companyId, load]);

  const update = <K extends keyof ShoppingSettings>(k: K, v: ShoppingSettings[K]) => {
    if (!canEdit) return;
    setSettings((s) => ({ ...s, [k]: v }));
  };

  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSnapshot);

  const save = async () => {
    if (!companyId || !canEdit || saving) return;
    setSaving(true);
    savingRef.current = true;
    const res = await saveShoppingSettings(supabase, companyId, userId, settings);
    savingRef.current = false;
    setSaving(false);
    if (res.ok) {
      setSavedSnapshot(settings);
      setUpdatedAt(new Date().toISOString());
      void resolveEditorName(userId);
      setTableMissing(false);
      toast({ title: "Settings saved", description: "Synced to everyone on your shopping team." });
    } else if (res.tableMissing) {
      setTableMissing(true);
      toast({ title: "Settings table not migrated yet", description: "Run migration 20260705130000 in Supabase, then save again.", variant: "destructive" });
    } else {
      toast({ title: "Could not save", description: res.error || undefined, variant: "destructive" });
    }
  };

  const savedAgo = relativeTime(updatedAt);

  return (
    <ShoppingPageShell
      pageTitle="Shopping settings - CateringMS"
      heading="Settings"
      subheading="Procurement defaults for this catering company, shared across your shopping team."
      icon={SettingsIcon}
      width="narrow"
      headerAction={
        canEdit ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettings(SHOPPING_SETTINGS_DEFAULTS)}
              disabled={!loaded}
            >
              Reset to defaults
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={save}
              disabled={saving || !loaded || !dirty}
            >
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" />Saving</> : <><Save className="h-4 w-4 mr-2" />{dirty ? "Save changes" : "Saved"}</>}
            </Button>
          </>
        ) : undefined
      }
      meta={
        loaded ? (
          <span className={SHOPPING_HERO_CHIP}>
            {canEdit ? <Users className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {canEdit
              ? (savedAgo ? `Team-synced · saved ${savedAgo}${updatedByName ? ` by ${updatedByName}` : ""}` : "Synced across your team")
              : "View only · ask an admin to change these"}
          </span>
        ) : undefined
      }
    >
      {!loaded ? (
        <div className="flex items-center justify-center py-16" aria-busy="true" aria-label="Loading settings">
          <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none text-slate-400 dark:text-slate-500" />
        </div>
      ) : (
        <div className="space-y-5">
          {tableMissing && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              The shopping settings table isn&apos;t migrated on this database yet. Values below are defaults and won&apos;t persist until migration <code className="font-mono text-xs">20260705130000_company_shopping_settings</code> is applied in the Supabase SQL editor.
            </div>
          )}

          {/* Group: Purchase runs */}
          <PortalCard>
            <PortalCardHeader
              title={
                <span className="flex items-center gap-2">
                  Purchase runs
                  <InfoTooltip content="Defaults used when a shopping list is created or closed. Shared with your whole shopping team." />
                </span>
              }
            />
            <p className="-mt-2 mb-4 text-sm text-slate-600 dark:text-slate-400">Defaults for shopping lists and procurement runs</p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <SettingRow
                id="rrc"
                label="Require a receipt to close a list"
                help="When on, a shopping list can only be marked complete with a receipt attached - a no-receipt reason won't be accepted."
                live
              >
                <Switch id="rrc" disabled={!canEdit} checked={settings.receiptRequiredOnComplete} onCheckedChange={(v) => update("receiptRequiredOnComplete", v)} />
              </SettingRow>

              <SettingRow
                id="lt"
                label="Default lead time (days)"
                help="Used as the fallback lead time in reorder-quantity suggestions when a supplier has none set."
                live
              >
                <Input id="lt" type="number" min="0" max="30" disabled={!canEdit} value={settings.defaultLeadTimeDays} onChange={(e) => update("defaultLeadTimeDays", Number(e.target.value))} className="w-32" />
              </SettingRow>

              <SettingRow
                id="acu"
                label="Auto-create lists from upcoming events"
                help={COMING_SOON_NOTE}
                comingSoon
              >
                <Switch id="acu" disabled checked={settings.autoCreateListFromUpcoming} onCheckedChange={(v) => update("autoCreateListFromUpcoming", v)} />
              </SettingRow>

              <SettingRow
                id="uh"
                label="Upcoming events horizon (days)"
                help={COMING_SOON_NOTE}
                comingSoon
              >
                <Input id="uh" type="number" min="1" max="60" disabled value={settings.upcomingHorizonDays} onChange={(e) => update("upcomingHorizonDays", Number(e.target.value))} className="w-32" />
              </SettingRow>
            </div>
          </PortalCard>

          {/* Group: Variance + budget */}
          <PortalCard>
            <PortalCardHeader
              title={
                <span className="flex items-center gap-2">
                  Variance + budget
                  <InfoTooltip content="Controls when a closed shopping run gets flagged as over/under its estimate, and whether the admin is notified." />
                </span>
              }
            />
            <p className="-mt-2 mb-4 text-sm text-slate-600 dark:text-slate-400">Triggers for price-variance alerts</p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <SettingRow
                id="va"
                label="Variance alert threshold (%)"
                help="Flag a completed list when actual spend differs from the estimate by more than this percentage."
                live
                stacked
              >
                <Input id="va" type="number" min="0" max="100" disabled={!canEdit} value={settings.varianceAlertPct} onChange={(e) => update("varianceAlertPct", Number(e.target.value))} className="w-32" />
              </SettingRow>

              <SettingRow
                id="nav"
                label="Notify admin on variance breach"
                help="When a list breaches the threshold above, push a high-priority alert to the company admins."
                live
              >
                <Switch id="nav" disabled={!canEdit} checked={settings.notifyAdminOnVariance} onCheckedChange={(v) => update("notifyAdminOnVariance", v)} />
              </SettingRow>
            </div>
          </PortalCard>

          {/* Group: Suppliers + alerts */}
          <PortalCard>
            <PortalCardHeader
              title={
                <span className="flex items-center gap-2">
                  Suppliers + alerts
                  <InfoTooltip content="Supplier ranking preference and the low-stock alert. These consume background jobs that are still being built." />
                </span>
              }
            />
            <p className="-mt-2 mb-4 text-sm text-slate-600 dark:text-slate-400">Supplier preferences and stock notifications</p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <SettingRow
                id="prs"
                label="Prefer rated suppliers (rating 4+)"
                help={COMING_SOON_NOTE}
                comingSoon
              >
                <Switch id="prs" disabled checked={settings.preferRatedSuppliers} onCheckedChange={(v) => update("preferRatedSuppliers", v)} />
              </SettingRow>

              <SettingRow
                id="anls"
                label="Auto-notify on low stock"
                help={COMING_SOON_NOTE}
                comingSoon
              >
                <Switch id="anls" disabled checked={settings.autoNotifyOnLowStock} onCheckedChange={(v) => update("autoNotifyOnLowStock", v)} />
              </SettingRow>
            </div>
          </PortalCard>

          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 px-1">
            Settings are stored per company and shared with everyone on your shopping team. Controls marked <span className="font-semibold">Live</span> take effect immediately; controls marked <span className="font-semibold">Coming soon</span> are saved but not yet consumed by any automation.
          </p>
        </div>
      )}
    </ShoppingPageShell>
  );
}

/** One settings row. `live` shows a green Live pill; `comingSoon` shows a
 *  muted pill and is expected to be disabled by the caller. `stacked`
 *  puts the control under the label (for wide number inputs). */
function SettingRow({
  id, label, help, children, live, comingSoon, stacked,
}: {
  id: string;
  label: string;
  help: string;
  children: React.ReactNode;
  live?: boolean;
  comingSoon?: boolean;
  stacked?: boolean;
}) {
  const labelBlock = (
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <Label htmlFor={id} className="text-slate-700 dark:text-slate-200">{label}</Label>
        {live && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Live
          </span>
        )}
        {comingSoon && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-700/60 dark:text-slate-400">
            Coming soon
          </span>
        )}
        <InfoTooltip content={help} />
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{help}</p>
    </div>
  );

  if (stacked) {
    return (
      <div className="py-4 first:pt-0 last:pb-0">
        {labelBlock}
        <div className="mt-2">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      {labelBlock}
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function ShoppingSettingsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SHOPPING_STAFF, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.REGION_ADMIN, UserRole.ADMIN]}>
      <ShoppingSettingsPageInner />
    </ProtectedRoute>
  );
}
