/**
 * Role-specific welcome banner for the team portal dashboards.
 *
 * Shows once per device per user (sessionStorage-keyed). Each portal
 * gets its own copy so a kitchen lead and a driver don't see the same
 * generic blurb -- the value prop differs by role.
 *
 * Render this near the top of /team-portal/{role}/dashboard. It collapses
 * itself the moment it's dismissed and won't reappear in the same browser
 * session.
 */
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChefHat, Truck, Sparkles, ShoppingCart, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TeamRole = "kitchen" | "driver" | "cleaning" | "shopping";

interface RoleCopy {
  title: string;
  intro: string;
  bullets: string[];
  icon: LucideIcon;
  gradient: string;
  accent: string;
}

const COPY: Record<TeamRole, RoleCopy> = {
  kitchen: {
    title: "Welcome to the kitchen portal",
    intro: "Everything you need to run prep without surprises:",
    bullets: [
      "Today's prep list, per-order, with portion targets",
      "Live production board -- mark items ready, no shouting across the kitchen",
      "Your shifts and BCEA-fair overtime, tracked automatically",
    ],
    icon: ChefHat,
    gradient: "from-orange-500 to-red-500",
    accent: "bg-orange-50 border-orange-200",
  },
  driver: {
    title: "Welcome to the driver portal",
    intro: "Your day in one place:",
    bullets: [
      "Today's routes with optimised stop order + ETA",
      "Tap to confirm pickup, on-route, and delivered -- proof of delivery captured automatically",
      "Earnings dashboard so you always know where you stand",
    ],
    icon: Truck,
    gradient: "from-blue-500 to-indigo-500",
    accent: "bg-blue-50 border-blue-200",
  },
  cleaning: {
    title: "Welcome to the cleaning portal",
    intro: "Equipment in, equipment out -- with proof:",
    bullets: [
      "Tasks for today, by area, with verification checkpoints",
      "Damage-report flow so disputes about who broke what stop dead",
      "On-duty board: tap in, tap out, fair pay with no admin chasing",
    ],
    icon: Sparkles,
    gradient: "from-cyan-500 to-blue-500",
    accent: "bg-cyan-50 border-cyan-200",
  },
  shopping: {
    title: "Welcome to the shopping portal",
    intro: "Demand-driven shopping, no overspending:",
    bullets: [
      "Live shopping list pulled straight from confirmed orders",
      "Low-stock alerts before you run out, not after",
      "Receipt scanner that links spend back to suppliers + inventory",
    ],
    icon: ShoppingCart,
    gradient: "from-green-500 to-emerald-500",
    accent: "bg-green-50 border-green-200",
  },
};

const KEY = (role: TeamRole, userId?: string | null) =>
  `team_welcome_${role}_${userId ?? "anon"}`;

interface Props {
  role: TeamRole;
  /** Stable per-user key so we show the banner once per user, not once per browser. */
  userId?: string | null;
}

export function TeamWelcomeBanner({ role, userId }: Props) {
  const copy = COPY[role];
  const [hidden, setHidden] = useState(true); // start hidden until we've checked storage

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = window.sessionStorage.getItem(KEY(role, userId));
      setHidden(!!seen);
    } catch {
      setHidden(false);
    }
  }, [role, userId]);

  if (hidden) return null;

  const Icon = copy.icon;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(KEY(role, userId), "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <Card className={`border ${copy.accent} shadow-sm mb-4 sm:mb-6`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <div
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${copy.gradient} flex items-center justify-center shadow-md flex-shrink-0`}
          >
            <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900">{copy.title}</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={dismiss}
                aria-label="Dismiss welcome"
                className="h-7 w-7 -mt-1 -mr-1 text-slate-500 hover:text-slate-900 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-slate-700 mt-1">{copy.intro}</p>
            <ul className="text-sm text-slate-700 mt-2 space-y-1">
              {copy.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <span className="text-slate-400 mt-1 flex-shrink-0">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
