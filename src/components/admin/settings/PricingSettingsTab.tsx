import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DollarSign } from "lucide-react";
import type { PricingSettings, UpdatePricingSetting } from "./types";

interface Props {
  settings: PricingSettings;
  onUpdate: UpdatePricingSetting;
}

interface Field {
  key: keyof PricingSettings;
  label: string;
  tooltip: string;
}

const ROWS: Field[][] = [
  [
    {
      key: "weekendPremium",
      label: "Weekend Premium (%)",
      tooltip:
        "Extra percentage added to the menu subtotal when the event date falls on a Saturday or Sunday.\n\n0 disables. 10 means a R5,000 base order becomes R5,500 on a Saturday.",
    },
    {
      key: "lastMinuteSurcharge",
      label: "Last Minute Surcharge (%)",
      tooltip:
        "Extra percentage when the event is within 7 days of the quote being created.\n\nCovers the rush cost of pulling stock and staff at short notice. 0 disables.",
    },
  ],
  [
    {
      key: "earlyBirdDiscount",
      label: "Early Bird Discount (%)",
      tooltip:
        "Discount applied when the event is more than 60 days out. Rewards clients who book early so you can lock in suppliers and staffing.\n\n0 disables.",
    },
    {
      key: "bulkDiscountThreshold",
      label: "Bulk Discount Threshold (guests)",
      tooltip:
        "Number of guests at which the bulk discount kicks in.\n\nMeasured against the quote's guest_count, not item totals. 100 means events of 100+ guests get the bulk-discount %.",
    },
  ],
  [
    {
      key: "bulkDiscountPercent",
      label: "Bulk Discount (%)",
      tooltip:
        "Discount applied when the guest count meets or exceeds the threshold above.\n\nReflects the lower per-head cost of large events. Stacks AFTER weekend / last-minute uplifts.",
    },
    {
      key: "minimumOrderValue",
      label: "Minimum Order Value (R)",
      tooltip:
        "Quotes whose subtotal falls below this number get a warning at save time so you can decline or upsell.\n\nDoes not auto-block the save. The quote builder is allowed to go below for special cases.",
    },
  ],
];

/**
 * Pricing tab for /admin/settings. Six numeric uplifts/discounts the
 * quote builder applies automatically. Inputs are uniform enough that
 * a ROWS config + map keeps the component tight; if a field gains
 * suffix copy or special validation, promote it to its own block.
 *
 * Extracted from inline in src/pages/admin/settings.tsx (P2-13
 * Phase C settings split).
 */
export function PricingSettingsTab({ settings, onUpdate }: Props) {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
          <DollarSign className="w-4 h-4 md:w-5 md:h-5" />
          Pricing Rules
          <InfoTooltip
            content={
              "Premium uplifts and discount rules the quote builder applies automatically."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 md:px-6">
        {ROWS.map((row, idx) => (
          <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {row.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label className="text-sm md:text-base flex items-center gap-1">
                  {field.label}
                  <InfoTooltip content={field.tooltip} />
                </Label>
                <Input
                  type="number"
                  value={settings[field.key]}
                  onChange={(e) => onUpdate(field.key, parseInt(e.target.value) || 0)}
                />
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
