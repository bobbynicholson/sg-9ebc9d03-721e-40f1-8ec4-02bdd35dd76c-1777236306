import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Settings, Truck } from "lucide-react";
import { AddressAutocomplete } from "@/components/admin/AddressAutocomplete";
import type { CompanySettings, UpdateCompanySetting } from "./types";

interface Props {
  settings: CompanySettings;
  onUpdate: UpdateCompanySetting;
}

/**
 * Company tab for /admin/settings. Display name, contact details,
 * physical address, and the kitchen / HQ pin used for delivery
 * routing.
 *
 * Heterogenous enough (text, email, address autocomplete, lat/lng
 * pair) that a row-config indirection doesn't pay - kept as straight
 * JSX. Extracted from inline in src/pages/admin/settings.tsx (P2-13
 * Phase E settings split).
 */
export function CompanySettingsTab({ settings, onUpdate }: Props) {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
          <Settings className="w-4 h-4 md:w-5 md:h-5" />
          Company Information
          <InfoTooltip
            content={
              "Your display name, contact details, and kitchen location used in quotes and route planning.\n\nNote: there is a separate Company Profile page that holds the master record, those values take priority."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 md:px-6">
        <div className="space-y-2">
          <Label className="text-sm md:text-base">Company Name</Label>
          <Input
            value={settings.name}
            onChange={(e) => onUpdate("name", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm md:text-base">Email Address</Label>
          <Input
            type="email"
            value={settings.email}
            onChange={(e) => onUpdate("email", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm md:text-base">Phone Number</Label>
          <Input
            value={settings.phone}
            onChange={(e) => onUpdate("phone", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm md:text-base">Physical Address</Label>
          <Input
            value={settings.address}
            onChange={(e) => onUpdate("address", e.target.value)}
          />
        </div>
        <div className="border-t pt-4 mt-4">
          <h3 className="font-semibold text-base mb-1 flex items-center gap-2">
            <Truck className="w-4 h-4" />
            Kitchen / HQ Location
          </h3>
          <p className="text-xs text-slate-600 mb-3">
            Used as the navigation start point for drivers and as the origin for delivery distance + fee calculations.
            For multi-branch operations, set per-branch kitchens under <strong>Operations → Regions</strong>.
          </p>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm md:text-base">Kitchen address</Label>
              <AddressAutocomplete
                value={settings.kitchenAddress}
                onChange={(pick) => {
                  onUpdate("kitchenAddress", pick.address);
                  if (pick.lat != null) onUpdate("kitchenLat", pick.lat);
                  if (pick.lng != null) onUpdate("kitchenLng", pick.lng);
                }}
                placeholder="Search the kitchen / HQ address"
                hint="Pick from the list to lock the precise pin, this is what Google Maps uses as the start point."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm">Latitude</Label>
                <Input
                  type="number"
                  step="0.000001"
                  value={settings.kitchenLat || ""}
                  onChange={(e) => onUpdate("kitchenLat", parseFloat(e.target.value))}
                  placeholder="auto-filled from address"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Longitude</Label>
                <Input
                  type="number"
                  step="0.000001"
                  value={settings.kitchenLng || ""}
                  onChange={(e) => onUpdate("kitchenLng", parseFloat(e.target.value))}
                  placeholder="auto-filled from address"
                />
              </div>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <strong>Tip:</strong> Pick from the dropdown to lock the exact pin. Manual coords drift the route Google Maps draws.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
