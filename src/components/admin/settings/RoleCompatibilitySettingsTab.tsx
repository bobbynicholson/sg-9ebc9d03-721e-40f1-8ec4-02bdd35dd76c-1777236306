import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChefHat, Truck } from "lucide-react";
import type {
  RoleCompatibilitySettings,
} from "./types";

interface Props {
  settings: RoleCompatibilitySettings;
  onUpdate: (
    key: keyof RoleCompatibilitySettings,
    value: boolean,
  ) => void;
}

const OPTIONS = [
  {
    key: "allowDriverWaiterOverlap" as const,
    title: "Drivers can also be waiters",
    description:
      "Allow the user-role setup to offer both Driver and Waiter for the same person.",
    help:
      "Turn this on when your delivery drivers also perform guest-facing waiter or service work. This does not assign the role to anyone by itself.",
    Icon: Truck,
  },
  {
    key: "allowKitchenCleaningOverlap" as const,
    title: "Kitchen staff can also be cleaners",
    description:
      "Allow the user-role setup to offer both Kitchen and Cleaning for the same person.",
    help:
      "Turn this on when your kitchen team also handles equipment cleaning or cleaning duties. This does not assign the role to anyone by itself.",
    Icon: ChefHat,
  },
] as const;

/**
 * Tenant policy gates for the future multi-role user picker. Keeping these
 * switches separate from individual departments means an admin can decide
 * which overlaps are valid before anyone is assigned a second role.
 */
export function RoleCompatibilitySettingsTab({ settings, onUpdate }: Props) {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
          Team role compatibility
          <InfoTooltip
            content={
              "Choose which role combinations are valid for this company. These switches are policy gates for the upcoming user-role picker; changing one does not alter existing user assignments."
            }
          />
        </CardTitle>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          Some companies use the same people across delivery, service, kitchen,
          and cleaning. Enable only the combinations your team actually uses.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-4 md:px-6">
        {OPTIONS.map(({ key, title, description, help, Icon }) => {
          const enabled = settings[key];
          return (
            <div
              key={key}
              className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <InfoTooltip content={help} />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    {description}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 pt-1">
                <span className="text-xs font-medium text-slate-500">
                  {enabled ? "Allowed" : "Not allowed"}
                </span>
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => onUpdate(key, checked)}
                  aria-label={title}
                />
              </div>
            </div>
          );
        })}
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900">
          Existing role assignments are unchanged. The next phase will use
          these saved company rules when an admin selects roles for a user.
        </p>
      </CardContent>
    </Card>
  );
}
