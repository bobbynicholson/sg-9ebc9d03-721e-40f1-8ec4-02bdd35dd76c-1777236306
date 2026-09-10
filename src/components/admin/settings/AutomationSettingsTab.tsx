import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Clock } from "lucide-react";
import type { AutomationSettings, UpdateAutomationSetting } from "./types";

interface Props {
  settings: AutomationSettings;
  onUpdate: UpdateAutomationSetting;
}

/**
 * Automation tab for /admin/settings. Captures the cadence numbers
 * the email engine reads when scheduling follow-ups, reminders and
 * review requests against a quote / event.
 *
 * The "live cron-driven sender" callout is intentional - the cron
 * infrastructure is in place (see process-email-queue +
 * quote-followup-send + balance-reminder), but the per-tenant
 * cadence values are not yet persisted to the company row; they
 * sit in user_metadata / localStorage for now. Operators can set
 * them and trust the queue picks them up the moment the persistence
 * link lands.
 *
 * Extracted from inline in src/pages/admin/settings.tsx (P2-13
 * Phase B settings split).
 */
export function AutomationSettingsTab({ settings, onUpdate }: Props) {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
          <Clock className="w-4 h-4 md:w-5 md:h-5" />
          Automation Rules
          <InfoTooltip
            content={
              "How long the system waits before nudging clients with follow-ups, reminders and review requests after a quote is sent or an event ends.\n\nValues you set here are saved against your company. The email engine reads them when scheduling each automated send."
            }
          />
        </CardTitle>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2">
          Heads up: these timings are stored against your company but the live cron-driven sender is still on the engineering backlog. Set them now. The moment the sender ships, your timings are already live.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm md:text-base flex items-center gap-1">
              First Follow-up (days)
              <InfoTooltip
                content={
                  "How many days after a quote is sent (and not yet accepted) the first follow-up email goes out.\n\nLeave at 5 to nudge gently a working week later. Lower it for shorter sales cycles."
                }
              />
            </Label>
            <Input
              type="number"
              value={settings.autoFollowUpDays}
              onChange={(e) => onUpdate("autoFollowUpDays", parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm md:text-base flex items-center gap-1">
              Second Follow-up (days)
              <InfoTooltip
                content={
                  "How many days after the quote was sent the second (final) follow-up goes out.\n\nThis is the email that can carry a small discount to nudge a stalled quote across the line."
                }
              />
            </Label>
            <Input
              type="number"
              value={settings.secondFollowUpDays}
              onChange={(e) => onUpdate("secondFollowUpDays", parseInt(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm md:text-base flex items-center gap-1">
            Follow-up Discount (%)
            <InfoTooltip
              content={
                "Discount baked into the second follow-up email. The template substitutes {{discount}} with this value, so editing it here updates every queued send.\n\nSet to 0 to disable the discount and keep the second follow-up as a plain reminder."
              }
            />
          </Label>
          <Input
            type="number"
            value={settings.autoDiscountPercent}
            onChange={(e) => onUpdate("autoDiscountPercent", parseInt(e.target.value) || 0)}
          />
          <p className="text-xs md:text-sm text-slate-600">
            Discount offered in second follow-up email.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm md:text-base flex items-center gap-1">
            Event Reminder Days
            <InfoTooltip
              content={
                "Comma-separated days BEFORE the event when reminder emails fire to the client.\n\nDefault 14, 7, 3, 1 means: a fortnight out, a week out, three days out and the day before.\n\nLeave blank to disable client-facing reminders."
              }
            />
          </Label>
          <Input
            value={settings.reminderDays.join(", ")}
            onChange={(e) =>
              onUpdate(
                "reminderDays",
                e.target.value.split(",").map((d) => parseInt(d.trim()) || 0).filter(Boolean),
              )
            }
          />
          <p className="text-xs md:text-sm text-slate-600">
            Comma-separated (e.g., 14, 7, 3, 1).
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm md:text-base flex items-center gap-1">
            Review Request (days after)
            <InfoTooltip
              content={
                "How many days AFTER the event date the review-request email goes out.\n\n1 = next morning, while the experience is fresh. Set higher if your post-event communications run later."
              }
            />
          </Label>
          <Input
            type="number"
            value={settings.reviewRequestDays}
            onChange={(e) => onUpdate("reviewRequestDays", parseInt(e.target.value) || 0)}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm md:text-base flex items-center gap-1">
            Complaint Response SLA (hours)
            <InfoTooltip
              content={
                "Internal target for how quickly the team responds to a customer complaint.\n\nWhen breached, the complaint surfaces with an amber 'overdue' badge on the dashboard so it stops slipping. Does not auto-reply."
              }
            />
          </Label>
          <Input
            type="number"
            value={settings.complaintResponseHours}
            onChange={(e) => onUpdate("complaintResponseHours", parseInt(e.target.value) || 0)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
