/**
 * /admin/notification-settings - per-user channel preferences.
 *
 * Phase 5 #7: migrated to react-hook-form + zod (P1-29 cont). The
 * old shape used a single setSettings tree with one updateSetting
 * helper; every Switch toggle re-rendered the whole page. Now each
 * Switch wires through Controller so RHF can manage state without
 * the cascade re-render. Schema validation guarantees the shape
 * matches what we persist.
 */
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs as _Tabs } from "@/components/ui/tabs";
import { Bell, Mail, MessageSquare, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import Head from "next/head";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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

  const { control, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });

  // Hydrate from localStorage on mount. zod parses the stored value
  // before reset so a malformed entry from an older schema doesn't
  // brick the page - on parse failure we fall back to DEFAULTS.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = schema.safeParse(JSON.parse(saved));
      if (parsed.success) {
        reset(parsed.data);
      } else {
        console.warn("[notification-settings] stored shape didn't match schema; ignoring");
      }
    } catch (e) {
      console.warn("[notification-settings] localStorage hydrate failed:", e);
    }
  }, [reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
      toast({
        title: "Settings Saved",
        description: "Your notification preferences have been updated.",
      });
    } catch (e: any) {
      toast({
        title: "Could not save",
        description: e?.message || "localStorage write failed",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Notification Settings | CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-screen-2xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Notification settings</h1>
            <p className="text-slate-600">Per-user channels and triggers. Decide which events ping you by email, in-app banner, WhatsApp, or push. Owners get everything by default. Tune the noise from here.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Email Notifications */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-600" />
                  Email Notifications
                  <InfoTooltip content={"Choose which email alerts you want for orders, payments and daily summaries.\n\nPreferences are saved on this browser for now."} />
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
                  <InfoTooltip content={"In-app push alerts for urgent issues, new orders, staff updates and stock changes.\n\nPreferences are saved on this browser for now."} />
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
                  <InfoTooltip content={"SMS preferences for critical alerts and payment reminders.\n\nNeeds an SMS provider connected before messages will actually go out."} />
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
                      Changes will take effect immediately after saving
                    </p>
                  </div>
                  <Button type="submit" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Settings"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </div>

        <Footer />
      </div>
    </>
  );
}
