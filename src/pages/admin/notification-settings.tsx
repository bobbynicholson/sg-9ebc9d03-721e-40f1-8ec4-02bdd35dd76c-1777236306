/**
 * /admin/notification-settings - per-user channel preferences.
 *
 * Phase 4 notifications backbone: persistence migrated from
 * localStorage to email_notification_preferences.preferences (jsonb)
 * via Phase 4 migration 20260521100000_notification_preferences_jsonb.
 * The previous build wrote to localStorage only - "Settings Saved"
 * toast was technically true but the preferences had zero effect on
 * what got delivered. See docs/notifications.md sections 4 and 5.
 *
 * Consumer-side wiring (notificationService reading these prefs
 * before fan-out) is a follow-up PR. localStorage still hydrated as
 * a fallback for offline / no-session cases.
 *
 * Phase 5 #7: react-hook-form + zod. Every Switch wires through
 * Controller so RHF manages state without cascade re-renders.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs as _Tabs } from "@/components/ui/tabs";
import { Bell, Mail, MessageSquare, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader } from "@/components/portal/ui";
import Head from "next/head";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Avoid an unused-import lint complaint. The Tabs component is
// still re-exported in the codebase but the page no longer uses it.
void _Tabs;

const schema = z.object({
  email: z.object({
    orderConfirmation: z.boolean(),
    orderUpdates: z.boolean(),
    paymentReceived: z.boolean(),
    dailySummary: z.boolean(),
  }),
  push: z.object({
    urgentAlerts: z.boolean(),
    newOrders: z.boolean(),
    staffUpdates: z.boolean(),
    inventoryAlerts: z.boolean(),
  }),
  sms: z.object({
    criticalAlerts: z.boolean(),
    paymentReminders: z.boolean(),
  }),
});

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  email: {
    orderConfirmation: true,
    orderUpdates: true,
    paymentReceived: true,
    dailySummary: false,
  },
  push: {
    urgentAlerts: true,
    newOrders: true,
    staffUpdates: false,
    inventoryAlerts: true,
  },
  sms: {
    criticalAlerts: true,
    paymentReminders: false,
  },
};

// Kept for an offline fallback hydrate when the DB read fails. Writes
// also mirror here so the next page load can show the user's settings
// instantly without waiting on a round-trip.
const STORAGE_KEY = "notification_settings";

interface ToggleProps {
  control: ReturnType<typeof useForm<FormValues>>["control"];
  name:
    | `email.${keyof FormValues["email"]}`
    | `push.${keyof FormValues["push"]}`
    | `sms.${keyof FormValues["sms"]}`;
  id: string;
  title: string;
  desc: string;
}

function ToggleRow({ control, name, id, title, desc }: ToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id} className="flex flex-col gap-1">
        <span className="font-medium">{title}</span>
        <span className="text-sm text-slate-600">{desc}</span>
      </Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} />
        )}
      />
    </div>
  );
}

export default function NotificationSettings() {
  const { toast } = useToast();
  const { user } = useAuth() as { user: { id?: string; company_id?: string } | null };
  const [loading, setLoading] = useState(true);

  const { control, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });

  // Hydrate from the DB on mount. If the DB read fails or returns
  // no row (first-time visitor), fall back to localStorage and then
  // to DEFAULTS. zod parses every source so a malformed value from
  // any tier doesn't brick the page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      // 1. Try the DB first.
      if (user?.id) {
        try {
          const { data, error } = await (supabase as any)
            .from("email_notification_preferences")
            .select("preferences")
            .eq("user_id", user.id)
            .maybeSingle();
          if (!error && data?.preferences) {
            const parsed = schema.safeParse(data.preferences);
            if (parsed.success) {
              if (!cancelled) {
                reset(parsed.data);
                setLoading(false);
              }
              return;
            }
            console.warn("[notification-settings] DB shape didn't match schema; falling back");
          }
        } catch (e) {
          console.warn("[notification-settings] DB hydrate failed:", e);
        }
      }

      // 2. Fall back to localStorage (offline / no-session cache).
      if (typeof window !== "undefined") {
        try {
          const saved = window.localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = schema.safeParse(JSON.parse(saved));
            if (parsed.success && !cancelled) {
              reset(parsed.data);
            }
          }
        } catch (e) {
          console.warn("[notification-settings] localStorage hydrate failed:", e);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reset, user?.id]);

  const onSubmit = async (values: FormValues) => {
    if (!user?.id) {
      toast({
        title: "Not signed in",
        description: "Sign in to save your notification preferences.",
        variant: "destructive",
      });
      return;
    }

    // Persist to the DB (source of truth). Upsert keyed on user_id so
    // the row gets created on first save and overwritten on each
    // subsequent save. company_id is best-effort.
    try {
      const { error } = await (supabase as any)
        .from("email_notification_preferences")
        .upsert(
          {
            user_id: user.id,
            company_id: user.company_id || null,
            preferences: values,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    } catch (e: any) {
      toast({
        title: "Could not save",
        description: e?.message || "DB write failed - try again in a moment.",
        variant: "destructive",
      });
      return;
    }

    // Mirror to localStorage so the next visit hydrates instantly
    // without waiting on a network round-trip. Non-fatal if it fails
    // (private mode, quota, etc.) - the DB write already succeeded.
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch (e) {
      console.warn("[notification-settings] localStorage mirror failed:", e);
    }

    toast({
      title: "Settings saved",
      description: "Your notification preferences have been updated.",
    });
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Notification settings - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Notification settings"
            icon={Bell}
            subtitle="Per-user channels and triggers. Decide which events ping you by email, in-app banner, WhatsApp, or push. Owners get everything by default. Tune the noise from here."
          />

          {loading ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="py-12 text-center">
                <Loader2 className="w-6 h-6 mx-auto text-slate-400 animate-spin" />
                <p className="text-sm text-slate-500 mt-3">Loading your preferences...</p>
              </CardContent>
            </Card>
          ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Email Notifications */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-600" />
                  Email Notifications
                  <InfoTooltip content={"Choose which email alerts you want for orders, payments and daily summaries.\n\nSaved to your account. Consumer-side wiring is rolling out per channel - see docs/notifications.md."} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ToggleRow control={control} name="email.orderConfirmation" id="orderConfirmation" title="Order Confirmations" desc="Get notified when new orders are placed" />
                <ToggleRow control={control} name="email.orderUpdates" id="orderUpdates" title="Order Updates" desc="Status changes and modifications" />
                <ToggleRow control={control} name="email.paymentReceived" id="paymentReceived" title="Payment Confirmations" desc="When payments are received" />
                <ToggleRow control={control} name="email.dailySummary" id="dailySummary" title="Daily Summary" desc="End of day business summary" />
              </CardContent>
            </Card>

            {/* Push Notifications */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-purple-600" />
                  Push Notifications
                  <InfoTooltip content={"In-app push alerts for urgent issues, new orders, staff updates and stock changes.\n\nSaved to your account."} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ToggleRow control={control} name="push.urgentAlerts" id="urgentAlerts" title="Urgent Alerts" desc="Critical issues requiring immediate attention" />
                <ToggleRow control={control} name="push.newOrders" id="newOrders" title="New Orders" desc="Real-time order notifications" />
                <ToggleRow control={control} name="push.staffUpdates" id="staffUpdates" title="Staff Updates" desc="Time clock and assignment changes" />
                <ToggleRow control={control} name="push.inventoryAlerts" id="inventoryAlerts" title="Inventory Alerts" desc="Low stock notifications" />
              </CardContent>
            </Card>

            {/* SMS Notifications */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                  SMS Notifications
                  <InfoTooltip content={"SMS preferences for critical alerts and payment reminders.\n\nNeeds an SMS provider connected before messages will actually go out (none integrated yet - see docs/notifications.md)."} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ToggleRow control={control} name="sms.criticalAlerts" id="criticalAlerts" title="Critical Alerts" desc="Emergency notifications via SMS" />
                <ToggleRow control={control} name="sms.paymentReminders" id="paymentReminders" title="Payment Reminders" desc="Overdue payment notifications" />
              </CardContent>
            </Card>

            {/* Save Button */}
            <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-purple-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600" />
                    <p className="text-sm text-slate-700">
                      Saved to your account; consumer-side wiring rolls out per channel.
                    </p>
                  </div>
                  <Button type="submit" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Settings"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
          )}
        </PortalShell>

        <Footer />
      </div>
    </>
  );
}
