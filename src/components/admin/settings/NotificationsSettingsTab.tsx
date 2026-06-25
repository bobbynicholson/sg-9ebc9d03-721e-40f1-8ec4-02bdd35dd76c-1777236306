import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Bell, Mail, CheckCircle, Banknote, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NotificationSettings, UpdateNotificationSetting } from "./types";

interface Props {
  settings: NotificationSettings;
  onUpdate: UpdateNotificationSetting;
}

interface Row {
  field: keyof NotificationSettings;
  title: string;
  description: string;
  Icon: LucideIcon;
  iconClass: string;
}

const ROWS: Row[] = [
  {
    field: "emailNewLead",
    title: "New Lead Notification",
    description: "Get notified when a new lead is captured",
    Icon: Mail,
    iconClass: "text-blue-600",
  },
  {
    field: "emailQuoteAccepted",
    title: "Quote Accepted",
    description: "Notification when client accepts quote",
    Icon: CheckCircle,
    iconClass: "text-brand-primary",
  },
  {
    field: "emailPaymentReceived",
    title: "Payment Received",
    description: "Alert when payment is processed",
    Icon: Banknote,
    iconClass: "text-brand-primary",
  },
  {
    field: "smsDriverAssigned",
    title: "Driver Assignment (SMS)",
    description: "SMS to driver when assigned",
    Icon: Truck,
    iconClass: "text-purple-600",
  },
  {
    field: "emailComplaint",
    title: "Complaint Submitted",
    description: "Immediate alert for new complaints",
    Icon: Bell,
    iconClass: "text-red-600",
  },
  {
    field: "emailDailyReport",
    title: "Daily Summary Report",
    description: "Daily email with key metrics",
    Icon: Mail,
    iconClass: "text-slate-600",
  },
];

/**
 * Notification preferences tab for /admin/settings. Six toggles
 * controlling per-event email + SMS alerts (new lead, quote
 * accepted, payment received, driver assignment, complaint, daily
 * summary).
 *
 * Pure presentation - parent owns the settings object and the
 * persistence handler. Extracted from the inline tab body in
 * src/pages/admin/settings.tsx as part of the P2-13 Phase A
 * settings split.
 */
export function NotificationsSettingsTab({ settings, onUpdate }: Props) {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
          <Bell className="w-4 h-4 md:w-5 md:h-5" />
          Notification Preferences
          <InfoTooltip
            content={
              "Toggle email and SMS alerts on a per-event basis, new bookings, status changes, payments and so on."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4 px-4 md:px-6">
        {ROWS.map((row) => {
          const { field, title, description, Icon, iconClass } = row;
          return (
            <div
              key={field}
              className="flex items-center justify-between p-3 bg-slate-50 rounded-lg gap-2"
            >
              <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                <Icon className={`w-4 h-4 md:w-5 md:h-5 ${iconClass} flex-shrink-0`} />
                <div className="min-w-0">
                  <p className="font-medium text-sm md:text-base">{title}</p>
                  <p className="text-xs md:text-sm text-slate-600 truncate">{description}</p>
                </div>
              </div>
              <Switch
                checked={settings[field]}
                onCheckedChange={(checked) => onUpdate(field, checked)}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
