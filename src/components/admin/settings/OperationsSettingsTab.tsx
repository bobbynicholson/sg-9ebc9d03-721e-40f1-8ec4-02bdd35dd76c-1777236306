import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { COUNTRIES } from "@/lib/regionGeography";
import { ChefHat } from "lucide-react";
import type { OperationsSettings, UpdateOperationsSetting } from "./types";

interface Props {
  settings: OperationsSettings;
  onUpdate: UpdateOperationsSetting;
}

interface Field {
  key: Exclude<keyof OperationsSettings, "serviceAreaBase" | "serviceAreas" | "unavailableAreas">;
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
        "Hard cap on the number of events your team will accept on the same day.\n\nQuote builder and public quote acceptance use this to prevent overbooking the diary.",
    },
  ],
  [
    {
      key: "maxGuestsPerEvent",
      label: "Max Guests Per Event",
      tooltip:
        "Largest single event size your team will accept.\n\nLeave 0 for no limit. When set, a quote above this guest count is flagged for admin and blocked from public acceptance until the admin changes the cap or the quote.",
      helpText: "0 means no per-event guest limit.",
    },
    {
      key: "maxKitchenLoadPerDay",
      label: "Kitchen Capacity Per Day",
      tooltip:
        "Maximum total guest-equivalent kitchen load for one event date.\n\nLeave 0 for no limit. The current calculation uses guest count as the kitchen-load unit, so two 150-guest events count as 300.",
      helpText: "0 means no daily kitchen-load limit.",
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
  const provinces = COUNTRIES.find((country) => country.code === "ZA")?.divisions || [];
  const toggleArea = (key: "serviceAreas" | "unavailableAreas", area: string, checked: boolean) => {
    const otherKey = key === "serviceAreas" ? "unavailableAreas" : "serviceAreas";
    const current = settings[key];
    onUpdate(key, checked ? [...current, area] : current.filter((value) => value !== area));
    if (checked) onUpdate(otherKey, settings[otherKey].filter((value) => value !== area));
  };

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
                    onChange={(e) => onUpdate(field.key, parse(e.target.value) || 0)}
                  />
                  {field.helpText && (
                    <p className="text-xs text-slate-600">{field.helpText}</p>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div className="space-y-4 border-t pt-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Service areas</h3>
            <p className="mt-1 text-xs text-slate-600">These company details are used in the lead email option “Outside our area”.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="service-area-base">Where your company is based</Label>
            <Input
              id="service-area-base"
              value={settings.serviceAreaBase}
              onChange={(event) => onUpdate("serviceAreaBase", event.target.value)}
              placeholder="Cape Town"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {([
              ["serviceAreas", "Areas you serve"],
              ["unavailableAreas", "Areas you do not serve yet"],
            ] as const).map(([key, title]) => (
              <fieldset key={key} className="min-w-0 rounded-md border border-slate-200 p-3">
                <legend className="px-1 text-sm font-medium text-slate-800">{title}</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {provinces.map((area) => (
                    <label key={`${key}-${area}`} className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                      <Checkbox
                        checked={settings[key].includes(area)}
                        onCheckedChange={(checked) => toggleArea(key, area, checked === true)}
                      />
                      <span className="break-words">{area}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
