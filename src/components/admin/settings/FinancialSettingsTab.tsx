import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Banknote } from "lucide-react";
import type { FinancialSettings, UpdateFinancialSetting } from "./types";
import {
  describePaymentDue,
  describePaymentReminders,
  paymentDueDate,
  paymentReminderTargetDate,
  type PaymentDueDirection,
  type PaymentReminderMode,
} from "@/lib/paymentReminderSchedule";

/** Fixed sample event date for the worked example under the settings. */
const EXAMPLE_EVENT = "2026-11-20";

function formatExample(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

interface Props {
  settings: FinancialSettings;
  onUpdate: UpdateFinancialSetting;
}

/**
 * Financial tab for /admin/settings. Currency, VAT, deposit %,
 * balance/amendment timelines, fallback cancellation fee and refund
 * turnaround copy. Drives every invoice and the deposit/balance
 * flow on the booking side.
 *
 * The "How Deposit & Balance Works" callout reads live state, so the
 * tab keeps tight coupling to the FinancialSettings shape rather than
 * accepting a pre-rendered explainer string.
 *
 * Kept as straight JSX rather than a row-config indirection - the
 * mix of Select, numeric inputs and live-state copy doesn't reward
 * a config table.
 *
 * Extracted from inline in src/pages/admin/settings.tsx (P2-13
 * Phase G settings split).
 */
export function FinancialSettingsTab({ settings, onUpdate }: Props) {
  const due = { direction: settings.paymentDueDirection, days: settings.balanceDueDays };
  const reminders = { mode: settings.paymentReminderMode, days: settings.paymentReminderDays };
  const exampleDue = paymentDueDate(EXAMPLE_EVENT, due);
  const exampleReminder = paymentReminderTargetDate(reminders, due, EXAMPLE_EVENT);

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
          <Banknote className="w-4 h-4 md:w-5 md:h-5" />
          Financial Settings
          <InfoTooltip
            content={
              "Currency, VAT, deposit percentage, balance due rules, and cancellation fees.\n\nThis drives every invoice and the deposit/balance flow on the booking side."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm md:text-base flex items-center gap-1">
              Currency
              <InfoTooltip
                content={
                  "The currency every quote, invoice and refund will be issued in. Default ZAR for South African operators.\n\nAll prices in your menu, equipment list and quotes are interpreted in this currency."
                }
              />
            </Label>
            <Select
              value={settings.currency}
              onValueChange={(value) => onUpdate("currency", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ZAR">ZAR (South African Rand)</SelectItem>
                <SelectItem value="USD">USD (US Dollar)</SelectItem>
                <SelectItem value="EUR">EUR (Euro)</SelectItem>
                <SelectItem value="GBP">GBP (British Pound)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm md:text-base flex items-center gap-1">
              VAT/Tax Rate (%)
              <InfoTooltip
                content={
                  "VAT or sales tax percentage added to the subtotal on every quote and invoice.\n\nFor SA VAT-registered operators this is 15. Set to 0 if you're not VAT-registered. The public quote will not show a VAT line."
                }
              />
            </Label>
            <Input
              type="number"
              value={settings.taxRate}
              onChange={(e) => onUpdate("taxRate", parseInt(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="border-t pt-4 mt-4">
          <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
            <Banknote className="w-4 h-4" />
            Deposit & Balance Payment Settings
          </h3>
          <p className="text-xs md:text-sm text-slate-600 mb-4">
            Configure how clients pay for their events - deposit to confirm booking, then the balance before or after the event
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm md:text-base flex items-center gap-1">
                Required Deposit (%)
                <InfoTooltip
                  content={
                    "How much of the total the client must pay to confirm a booking.\n\nDeposit invoice is generated automatically the moment the quote is accepted. The remaining balance is invoiced separately closer to the event."
                  }
                />
              </Label>
              <Input
                type="number"
                value={settings.depositPercent}
                onChange={(e) => onUpdate("depositPercent", parseInt(e.target.value) || 0)}
                min="10"
                max="100"
              />
              <p className="text-xs text-slate-600 mt-1">Percentage of total to confirm booking (10-100%).</p>
            </div>

            <div>
              <Label htmlFor="payment-due-days" className="text-sm md:text-base flex items-center gap-1">
                Payment is due
                <InfoTooltip
                  content={
                    "When every client must pay the remaining balance, counted from the event date.\n\nUse \"before the event\" if clients pay upfront, or \"after the event\" if they pay on terms (for example 30 days after). Invoice due dates and the payment reminder follow this."
                  }
                />
              </Label>
              <div className="flex gap-2">
                <Input
                  id="payment-due-days"
                  type="number"
                  className="w-24"
                  value={settings.balanceDueDays}
                  onChange={(e) => onUpdate("balanceDueDays", Math.max(0, parseInt(e.target.value) || 0))}
                  min="0"
                  max="365"
                />
                <Select
                  value={settings.paymentDueDirection}
                  onValueChange={(value) => onUpdate("paymentDueDirection", value as PaymentDueDirection)}
                >
                  <SelectTrigger aria-label="Before or after the event">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before_event">days before the event</SelectItem>
                    <SelectItem value="after_event">days after the event</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-slate-600 mt-1">{describePaymentDue(due)}. Applies to every client.</p>
            </div>

            <div>
              <Label className="text-sm md:text-base flex items-center gap-1">
                Final Order Changes (days before event)
                <InfoTooltip
                  content={
                    "The last day on which clients can amend guest count, menu items or venue address from their portal.\n\nAfter this point, edits are admin-only. Protects you from same-week swaps that bust kitchen prep."
                  }
                />
              </Label>
              <Input
                type="number"
                value={settings.finalOrderChangeDays || 7}
                onChange={(e) => onUpdate("finalOrderChangeDays", parseInt(e.target.value) || 0)}
                min="1"
                max="30"
              />
              <p className="text-xs text-slate-600 mt-1">Last day clients can modify guest count/address.</p>
            </div>

            <div>
              <Label className="text-sm md:text-base flex items-center gap-1">
                Cancellation Fee (%)
                <InfoTooltip
                  content={
                    "Fallback cancellation fee when no tier on the Cancellation tab applies.\n\nThe Cancellation tab lets you set proper notice-based tiers (e.g. 100% within 7 days, 50% within 30 days). This is the catch-all if no tier matches."
                  }
                />
              </Label>
              <Input
                type="number"
                value={settings.cancellationFeePercent}
                onChange={(e) => onUpdate("cancellationFeePercent", parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-slate-600 mt-1">Fee charged for cancellations.</p>
            </div>
          </div>

          <div className="bg-blue-50 p-3 md:p-4 rounded-lg mt-4">
            <h4 className="font-semibold text-sm text-blue-900 mb-2">How Deposit & Balance Works:</h4>
            <ul className="space-y-1 text-xs md:text-sm text-blue-800">
              <li>1. Client accepts quote → Pays {settings.depositPercent}% deposit to confirm booking</li>
              <li>2. {describePaymentDue(due)}. {describePaymentReminders(reminders)}</li>
              <li>3. Clients can modify order until {settings.finalOrderChangeDays || 7} days before event</li>
              <li>4. After deadline → Order locked, balance must be settled</li>
            </ul>
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div>
            <h3 className="font-semibold text-base">Payment reminders</h3>
            <p className="text-xs md:text-sm text-slate-600">
              Automatic email asking a client to pay an unpaid deposit or balance. Same for every client; each unpaid order gets one reminder.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="payment-reminder-mode" className="text-sm md:text-base">Payment reminder</Label>
              <Select
                value={settings.paymentReminderMode}
                onValueChange={(value) => onUpdate("paymentReminderMode", value as PaymentReminderMode)}
              >
                <SelectTrigger id="payment-reminder-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Don&apos;t send payment reminders</SelectItem>
                  <SelectItem value="before_due">Send one reminder before payment is due</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {settings.paymentReminderMode !== "off" && (
              <div>
                <Label htmlFor="payment-reminder-days" className="text-sm md:text-base">Days before payment is due</Label>
                <Input
                  id="payment-reminder-days"
                  type="number"
                  min="0"
                  max="365"
                  value={settings.paymentReminderDays}
                  onChange={(e) => onUpdate("paymentReminderDays", Math.max(0, parseInt(e.target.value) || 0))}
                />
              </div>
            )}
          </div>
          <p className="text-xs text-slate-600">
            {describePaymentReminders(reminders)}.
            {exampleDue && (
              <>
                {" "}Example: for an event on {formatExample(EXAMPLE_EVENT)}, payment is due {formatExample(exampleDue)}
                {exampleReminder ? ` and the reminder goes out on ${formatExample(exampleReminder)}` : ""}.
              </>
            )}
            {" "}Reminders you send yourself from Invoices still work.
          </p>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label htmlFor="default-payment-terms" className="text-sm md:text-base">
            Default payment terms
          </Label>
          <Textarea
            id="default-payment-terms"
            value={settings.paymentTermsText}
            onChange={(e) => onUpdate("paymentTermsText", e.target.value)}
            rows={3}
            maxLength={1200}
            placeholder="50% Deposit to secure booking.\nBalance due 48 hours prior to the event."
          />
          <p className="text-xs text-slate-600">
            Used as the company-wide default wording on new quotes and invoices.
          </p>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label className="text-sm md:text-base flex items-center gap-1">
            Refund Processing Time (days)
            <InfoTooltip
              content={
                "Estimated turnaround time you communicate to clients on a refund.\n\nDoesn't gate the refund itself. It just sets expectations on the client-facing email and the refunds dashboard. 7 = 'allow up to 7 working days for the refund to reflect'."
              }
            />
          </Label>
          <Input
            type="number"
            value={settings.refundProcessDays}
            onChange={(e) => onUpdate("refundProcessDays", parseInt(e.target.value) || 0)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
