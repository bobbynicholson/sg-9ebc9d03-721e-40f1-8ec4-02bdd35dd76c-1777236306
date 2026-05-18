import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Bell, Save } from "lucide-react";
import type { NotificationPreferences } from "./types";

interface Props {
  notificationPrefs: NotificationPreferences;
  setNotificationPrefs: (prefs: NotificationPreferences) => void;
  onSave: () => void;
}

interface Row {
  field: keyof NotificationPreferences;
  label: string;
  description: string;
}

const ROWS: Row[] = [
  { field: "email_notifications", label: "Email Notifications", description: "Receive notifications via email" },
  { field: "sms_notifications", label: "SMS Notifications", description: "Receive important updates via SMS" },
  { field: "push_notifications", label: "Push Notifications", description: "Receive push notifications in your browser" },
  { field: "order_updates", label: "Order Updates", description: "Get notified about order status changes" },
  { field: "delivery_updates", label: "Delivery Updates", description: "Track delivery progress in real-time" },
  { field: "marketing_emails", label: "Marketing Emails", description: "Receive promotional offers and updates" },
  { field: "weekly_summary", label: "Weekly Summary", description: "Get a weekly summary of your activity" },
];

/**
 * Notification preferences tab body. Seven toggles + a Save button.
 * Parent owns notificationPrefs state and the persistence handler;
 * this is pure presentation.
 *
 * Extracted from /account/settings in the P2-13 audit split.
 */
export function NotificationsTab({ notificationPrefs, setNotificationPrefs, onSave }: Props) {
  return (
    <Card className="border-0 shadow-lg dark:bg-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 dark:text-white">
          <Bell className="w-5 h-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription className="dark:text-slate-400">Choose how you want to be notified</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {ROWS.map((row, i) => (
            <div key={row.field}>
              {i > 0 && <Separator className="dark:bg-slate-700 mb-4" />}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base dark:text-slate-200">{row.label}</Label>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{row.description}</p>
                </div>
                <Switch
                  checked={notificationPrefs[row.field]}
                  onCheckedChange={(checked) =>
                    setNotificationPrefs({ ...notificationPrefs, [row.field]: checked })
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onSave} className="bg-orange-600 hover:bg-orange-700">
            <Save className="w-4 h-4 mr-2" />
            Save Notification Preferences
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
