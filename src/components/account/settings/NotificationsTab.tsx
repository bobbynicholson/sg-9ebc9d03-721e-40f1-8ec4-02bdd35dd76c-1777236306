import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PortalCard, PortalCardHeader } from "@/components/portal/ui";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import {
  AlertTriangle,
  Bell,
  ClipboardList,
  CreditCard,
  Loader2,
  Package,
  RefreshCcw,
  Save,
} from "lucide-react";
import type { EmailNotificationPrefs } from "./types";
import { EMAIL_PREF_DEFAULTS } from "./types";

interface Props {
  userId: string;
  companyId: string | null;
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

/**
 * Notifications tab for /account/settings. Self-contained: loads the
 * caller's email_notification_preferences row on mount and upserts it
 * on save (keyed on user_id - the table has a unique index there).
 *
 * Previously these toggles saved to localStorage only, so preferences
 * silently differed per device and no sender ever read them. Now they
 * drive the same row the DB email triggers consult.
 *
 * Only the boolean event columns are written; the `preferences` jsonb
 * column on the same row (owned by /admin/notification-settings and
 * the broadcast fan-out) is left untouched.
 */
export function NotificationsTab({ userId, companyId }: Props) {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<EmailNotificationPrefs>(EMAIL_PREF_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

      if (data) {
        // Column-level NULLs on legacy rows fall back to the migration
        // defaults rather than reading as "off".
        const next = { ...EMAIL_PREF_DEFAULTS };
        for (const field of PREF_FIELDS) {
          const value = (data as Record<string, unknown>)[field];
          if (typeof value === "boolean") next[field] = value;
        }
        setPrefs(next);
      } else {
        setPrefs(EMAIL_PREF_DEFAULTS);
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
      const payload: Record<string, unknown> = {
        user_id: userId,
        ...prefs,
        updated_at: new Date().toISOString(),
      };
      // Only stamp company_id when we actually know it - never clobber
      // an existing value with NULL.
      if (companyId) payload.company_id = companyId;

      const { error } = await supabase
        .from("email_notification_preferences")
        .upsert(payload as never, { onConflict: "user_id" });
      if (error) throw error;

      toast({
        title: "Notification preferences saved",
        description: "Emails will follow these settings from now on.",
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

  if (loading) {
    return (
      <PortalCard className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your notification preferences...
        </div>
      </PortalCard>
    );
  }

  if (loadError) {
    return (
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
    );
  }

  return (
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
        Choose which events email you. These apply across all your devices.
      </p>

      <div className="space-y-6">
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
                <div key={row.field} className="flex min-h-[56px] items-center justify-between gap-4 px-4 py-3">
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
                    checked={prefs[row.field]}
                    onCheckedChange={(checked) => setPrefs((prev) => ({ ...prev, [row.field]: checked }))}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="min-h-[44px] bg-brand-primary text-white hover:bg-brand-primary/90"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save notification preferences
            </>
          )}
        </Button>
      </div>
    </PortalCard>
  );
}
