import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign } from "lucide-react";
import type { FinancialSettings, UpdateFinancialSetting } from "./types";

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
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
          <DollarSign className="w-4 h-4 md:w-5 md:h-5" />
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
            <DollarSign className="w-4 h-4" />
            Deposit & Balance Payment Settings
          </h3>
          <p className="text-xs md:text-sm text-slate-600 mb-4">
            Configure how clients pay for their events - deposit to confirm booking, balance before the event
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
              <Label className="text-sm md:text-base flex items-center gap-1">
                Balance Due Days Before Event
                <InfoTooltip
                  content={
                    "How many days before the event the remaining balance invoice goes out.\n\n7 means the balance reminder fires a week before. The system also sends an overdue nudge if it's not paid by event day."
                  }
                />
              </Label>
              <Input
                type="number"
                value={settings.balanceDueDays || 7}
                onChange={(e) => onUpdate("balanceDueDays", parseInt(e.target.value) || 0)}
                min="1"
                max="30"
              />
              <p className="text-xs text-slate-600 mt-1">When clients must pay remaining balance.</p>
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
              <li>2. {settings.balanceDueDays || 7} days before event → Email reminder to pay balance</li>
              <li>3. Clients can modify order until {settings.finalOrderChangeDays || 7} days before event</li>
              <li>4. After deadline → Order locked, balance must be settled</li>
            </ul>
          </div>
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
