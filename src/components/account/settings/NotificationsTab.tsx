import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PortalCard, PortalCardHeader } from "@/components/portal/ui";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { DevicePushSettings } from "@/components/account/settings/DevicePushSettings";
import {
  AlertTriangle,
  Bell,
  ClipboardList,
  CreditCard,
  Loader2,
  MessageSquare,
  Package,
  RefreshCcw,
  Save,
} from "lucide-react";
import type { EmailNotificationPrefs } from "./types";
import { EMAIL_PREF_DEFAULTS } from "./types";

interface Props {
  userId: string;
  companyId: string | null;
  activeRole: string;
  companyName?: string | null;
  companySlug?: string | null;
}

interface Row {
  field: keyof EmailNotificationPrefs;
  label: string;
  description: string;
}

interface Group {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: Row[];
}

/**
 * Grouped per-event toggles. Every field maps 1:1 to a boolean column
 * on email_notification_preferences that a real sender consults (order
 * status trigger, driver-assignment mailer, stock alerts, digests).
 * The old generic toggles (SMS, push, marketing) were removed - nothing
 * consumed them, so showing them was dishonest.
 */
const GROUPS: Group[] = [
  {
    title: "Orders",
    icon: ClipboardList,
    rows: [
      { field: "order_confirmed", label: "Order confirmed", description: "When an order is confirmed and locked in" },
      { field: "order_status_changed", label: "Order status changes", description: "Any other move along the order timeline" },
      { field: "order_ready_for_pickup", label: "Ready for pickup or delivery", description: "When the kitchen marks an order ready" },
      { field: "order_delivered", label: "Order delivered", description: "When a delivery is completed" },
      { field: "order_cancelled", label: "Order cancelled", description: "When an order is called off" },
    ],
  },
  {
    title: "Payments",
    icon: CreditCard,
    rows: [
      { field: "payment_received", label: "Payment received", description: "When a payment lands against an invoice" },
      { field: "payment_due", label: "Payment due", description: "Reminders when a payment date is coming up" },
      { field: "invoice_sent", label: "Invoice sent", description: "When an invoice goes out" },
    ],
  },
  {
    title: "Work",
    icon: Bell,
    rows: [
      { field: "driver_assigned", label: "Delivery assigned", description: "When a delivery is assigned to you" },
      { field: "task_assigned", label: "Task assigned", description: "When a prep, cleaning or shopping task lands on your list" },
    ],
  },
  {
    title: "Stock",
    icon: Package,
    rows: [
      { field: "low_stock_alert", label: "Low stock", description: "When an item drops below its reorder level" },
      { field: "out_of_stock_alert", label: "Out of stock", description: "When an item runs out completely" },
    ],
  },
  {
    title: "Summaries",
    icon: ClipboardList,
    rows: [
      { field: "daily_summary", label: "Daily summary", description: "One email each morning with the day ahead" },
      { field: "weekly_report", label: "Weekly report", description: "A weekly wrap-up of activity and numbers" },
    ],
  },
];

const PREF_FIELDS = Object.keys(EMAIL_PREF_DEFAULTS) as Array<keyof EmailNotificationPrefs>;

type CategoryKey = "urgentAlerts" | "newOrders" | "staffUpdates" | "inventoryAlerts";
type ChannelKey = "push" | "whatsapp";
type ChannelValues = Record<ChannelKey, Record<CategoryKey, boolean>>;

const CHANNEL_DEFAULTS: ChannelValues = {
  push: { urgentAlerts: true, newOrders: true, staffUpdates: false, inventoryAlerts: true },
  whatsapp: { urgentAlerts: true, newOrders: true, staffUpdates: true, inventoryAlerts: true },
};

const CATEGORIES: Array<{ key: CategoryKey; title: string; description: string }> = [
  { key: "urgentAlerts", title: "Urgent alerts", description: "Critical issues that need prompt attention" },
  { key: "newOrders", title: "New orders", description: "New orders and delivery updates" },
  { key: "staffUpdates", title: "Staff updates", description: "Assignments and staff activity" },
  { key: "inventoryAlerts", title: "Inventory alerts", description: "Low stock and equipment shortages" },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readChannel(value: unknown, fallback: Record<CategoryKey, boolean>) {
  const source = asRecord(value);
  return Object.fromEntries(CATEGORIES.map(({ key }) => [
    key,
    typeof source[key] === "boolean" ? source[key] : fallback[key],
  ])) as Record<CategoryKey, boolean>;
}

/**
 * Notifications tab for /account/settings. Self-contained: loads the
 * caller's email_notification_preferences row on mount and upserts it
 * on save (keyed on user_id - the table has a unique index there).
 *
 * Previously these toggles saved to localStorage only, so preferences
 * silently differed per device and no sender ever read them. Now they
 * drive the same row the DB email triggers consult.
 *
 * Email event columns and push/WhatsApp categories share one load/save
 * flow on this tab. The legacy admin URL redirects here.
 */
export function NotificationsTab({ userId, companyId, activeRole, companyName, companySlug }: Props) {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<EmailNotificationPrefs>(EMAIL_PREF_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [channels, setChannels] = useState<ChannelValues>(CHANNEL_DEFAULTS);
  const storedPreferences = useRef<Record<string, unknown>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("email_notification_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;

      const row = data as unknown as Record<string, unknown> | null;
      const stored = asRecord(row?.preferences);
      storedPreferences.current = stored;
      setChannels({
        push: readChannel(stored.push, CHANNEL_DEFAULTS.push),
        whatsapp: readChannel(stored.whatsapp, CHANNEL_DEFAULTS.whatsapp),
      });

      if (row) {
        // Column-level NULLs on legacy rows fall back to the migration
        // defaults rather than reading as "off".
        const next = { ...EMAIL_PREF_DEFAULTS };
        for (const field of PREF_FIELDS) {
          const value = row[field];
          if (typeof value === "boolean") next[field] = value;
        }
        setPrefs(next);
      } else {
        setPrefs(EMAIL_PREF_DEFAULTS);
        storedPreferences.current = {};
      }
    } catch (err: unknown) {
      console.error("[NotificationsTab] load failed:", err);
      setLoadError(dbErrorMessage(err, { entity: "notification preferences" }));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const preferences: Record<string, unknown> = {
        ...storedPreferences.current,
        push: channels.push,
        whatsapp: channels.whatsapp,
      };
      // Email uses the table's boolean columns; SMS has no delivery
      // provider. Drop the obsolete JSON copies as users save here.
      delete preferences.email;
      delete preferences.sms;
      const payload: Record<string, unknown> = {
        user_id: userId,
        ...prefs,
        preferences,
        updated_at: new Date().toISOString(),
      };
      // Only stamp company_id when we actually know it - never clobber
      // an existing value with NULL.
      if (companyId) payload.company_id = companyId;

      const { error } = await supabase
        .from("email_notification_preferences")
        .upsert(payload as never, { onConflict: "user_id" });
      if (error) throw error;

      storedPreferences.current = payload.preferences as Record<string, unknown>;

      toast({
        title: "Notification settings saved",
        description: "Email, push and WhatsApp preferences have been updated.",
      });
    } catch (err: unknown) {
      console.error("[NotificationsTab] save failed:", err);
      toast({
        title: "Could not save notification preferences",
        description: dbErrorMessage(err, { entity: "notification preferences" }),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const devicePushPanel = (
    <DevicePushSettings userId={userId} activeRole={activeRole} companyName={companyName} companySlug={companySlug} />
  );
  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        {devicePushPanel}
        <PortalCard className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your notification preferences...
          </div>
        </PortalCard>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4 sm:space-y-6">
        {devicePushPanel}
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/60 dark:bg-rose-950/40">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-300">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                Could not load your notification preferences
              </p>
              <p className="mt-1 text-sm text-rose-700 dark:text-rose-300/90">{loadError}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/40"
                onClick={() => load()}
              >
                <RefreshCcw className="mr-2 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {devicePushPanel}
      <PortalCard>
        <PortalCardHeader
          title={
            <span className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-brand-primary" />
              Alert types
            </span>
          }
        />
        <p className="-mt-2 mb-5 text-sm text-slate-500 dark:text-slate-400">
          Choose which event types can send push and WhatsApp alerts. Enable push on each device above, then save once below to apply all changes.
        </p>
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          {(["push", "whatsapp"] as const).map((channel) => (
            <section key={channel} aria-labelledby={`notification-${channel}-title`}>
              <div className="mb-2 flex items-center gap-2">
                {channel === "push" ? <Bell className="h-3.5 w-3.5 text-slate-400" /> : <MessageSquare className="h-3.5 w-3.5 text-slate-400" />}
                <h3 id={`notification-${channel}-title`} className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {channel === "push" ? "Push alerts" : "WhatsApp alerts"}
                </h3>
              </div>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200/90 dark:divide-slate-800 dark:border-slate-800">
                {CATEGORIES.map(({ key, title, description }) => {
                  const id = `${channel}-${key}`;
                  return (
                    <div key={key} className="flex min-h-[56px] items-center justify-between gap-3 px-3 py-3 sm:gap-4 sm:px-4">
                      <div className="min-w-0 space-y-0.5">
                        <Label htmlFor={id} className="cursor-pointer text-sm font-medium">{title}</Label>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
                      </div>
                      <Switch
                        id={id}
                        className="shrink-0"
                        checked={channels[channel][key]}
                        onCheckedChange={(checked) => setChannels((current) => ({
                          ...current,
                          [channel]: { ...current[channel], [key]: checked },
                        }))}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </PortalCard>
      <PortalCard>
        <PortalCardHeader
          title={
            <span className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-brand-primary" />
              Email notifications
            </span>
          }
        />
      <p className="-mt-2 mb-5 text-sm text-slate-500 dark:text-slate-400">
        Choose which events email you. These settings apply to your account.
      </p>

        <div className="space-y-5 sm:space-y-6">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-2 flex items-center gap-2">
              <group.icon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {group.title}
              </p>
            </div>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200/90 dark:divide-slate-800 dark:border-slate-800">
              {group.rows.map((row) => (
                <div key={row.field} className="flex min-h-[56px] items-center justify-between gap-3 px-3 py-3 sm:gap-4 sm:px-4">
                  <div className="min-w-0 space-y-0.5">
                    <Label
                      htmlFor={`pref-${row.field}`}
                      className="cursor-pointer text-sm font-medium text-slate-900 dark:text-slate-100"
                    >
                      {row.label}
                    </Label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{row.description}</p>
                  </div>
                  <Switch
                    id={`pref-${row.field}`}
                    className="shrink-0"
                    checked={prefs[row.field]}
                    onCheckedChange={(checked) => setPrefs((prev) => ({ ...prev, [row.field]: checked }))}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800 sm:mt-6">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="min-h-11 w-full bg-brand-primary text-white hover:bg-brand-primary/90 sm:w-auto"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save notification settings
            </>
          )}
        </Button>
        </div>
      </PortalCard>
    </div>
  );
}
