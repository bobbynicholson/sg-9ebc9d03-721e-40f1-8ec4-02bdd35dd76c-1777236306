import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ChefHat } from "lucide-react";
import type { OperationsSettings, UpdateOperationsSetting } from "./types";

interface Props {
  settings: OperationsSettings;
  onUpdate: UpdateOperationsSetting;
}

interface Field {
  key: keyof OperationsSettings;
  label: string;
  tooltip: string;
  step?: string;
  parser?: (raw: string) => number;
  helpText?: string;
}

const ROWS: Field[][] = [
  [
    {
      key: "equipmentCleaningHours",
      label: "Equipment Cleaning (hours)",
      tooltip:
        "How many hours of cleaning time the dispatcher reserves between an event ending and the equipment being available again.\n\nKeeps a piece of equipment from being double-booked across two events that finish + start back-to-back.",
    },
    {
      key: "kitchenPrepHours",
      label: "Kitchen Prep Lead Time (hours)",
      tooltip:
        "How many hours before the event starts the kitchen needs to begin prep.\n\nDrives the prep-task scheduler. A 6 hour lead means a 17:00 event has a 11:00 prep start.",
    },
  ],
  [
    {
      key: "deliveryBufferMinutes",
      label: "Delivery Buffer (minutes)",
      tooltip:
        "Minutes the driver should arrive at the venue BEFORE the event start time, so setup is done by the time guests arrive.\n\n45 means the driver leaves the kitchen with 45 min spare on top of the Google-Maps route time.",
    },
    {
      key: "maxConcurrentEvents",
      label: "Max Concurrent Events",
      tooltip:
        "Hard cap on the number of events your team will accept on the same day.\n\nQuote builder warns when the cap would be exceeded so you don't overbook your kitchen capacity.",
    },
  ],
  [
    {
      key: "driverRadius",
      label: "Driver Service Radius (km)",
      tooltip:
        "How far from the kitchen / HQ you're willing to deliver.\n\nQuotes outside this radius surface a warning at save time. Doesn't block manual override. You can still take a one-off long-distance booking.",
    },
    {
      key: "deliveryCostPerKm",
      label: "Delivery Cost Per Kilometer (R)",
      tooltip:
        "Rand per kilometre used by the quote builder to auto-calculate the delivery fee from kitchen to venue.\n\nThe operator can manually override the fee on the quote. This is just the default rate.",
      step: "0.50",
      parser: parseFloat,
      helpText: "This rate will be used to automatically calculate delivery fees in quotes.",
    },
  ],
];

/**
 * Operations tab for /admin/settings. Lead times, prep buffers,
 * driver radius and per-kilometre rate. Inputs are mostly uniform
 * integers; the per-km rate is a float so its row carries its own
 * step + parseFloat in the config.
 *
 * Extracted from inline in src/pages/admin/settings.tsx (P2-13
 * Phase D settings split).
 */
export function OperationsSettingsTab({ settings, onUpdate }: Props) {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
          <ChefHat className="w-4 h-4 md:w-5 md:h-5" />
          Operational Settings
          <InfoTooltip
            content={
              "Lead times, prep buffers, driver radius and per-kilometre rate.\n\nThese feed the delivery fee calculation on every quote."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 md:px-6">
        {ROWS.map((row, idx) => (
          <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {row.map((field) => {
              const parse = field.parser ?? parseInt;
              return (
                <div key={field.key} className="space-y-2">
                  <Label className="text-sm md:text-base flex items-center gap-1">
                    {field.label}
                    <InfoTooltip content={field.tooltip} />
                  </Label>
                  <Input
                    type="number"
                    step={field.step}
                    value={settings[field.key]}
                    onChange={(e) => onUpdate(field.key, parse(e.target.value))}
                  />
                  {field.helpText && (
                    <p className="text-xs text-slate-600">{field.helpText}</p>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
