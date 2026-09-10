import { useEffect, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";

interface TrialStatus {
  isInTrial: boolean;
  daysRemaining: number;
  trialEndsAt: string | null;
}

// Reads trial state straight from the company row that AuthContext already
// fetches. The previous implementation queried the `subscriptions` table via
// subscriptionService.checkTrialStatus, but new tenants are created with a
// trial against companies.subscription_status (no subscriptions row exists),
// so the banner never appeared. This now matches the rest of the codebase
// which treats companies as the source of truth for subscription state.
//
// Wave 70.14 - role gate added so the trial countdown only renders
// for the tenant owner / admin who is actually responsible for
// upgrading. Kitchen / driver / cleaning / shopping staff (and any
// other staff role) no longer see the trial banner - they shouldn't
// know whether the boss is still on trial or whether the company
// is about to lose access. Internally we self-gate so every caller
// (Layout.tsx, any future mount) is automatically safe without
// having to pass props.
const ADMIN_ROLES_THAT_SEE_TRIAL = new Set([
  "super_admin",
  "company_admin",
  "admin",
  "owner",
]);

export function TrialExpiryBanner() {
  const { profile, company } = useAuth() as any;
  const [dismissed, setDismissed] = useState(false);

  // Staff roles never see the trial banner. Bobby's brief: kitchen /
  // driver / cleaning / shopping staff shouldn't know about the
  // subscription state. The banner exists for the person who can
  // actually fix it.
  const role: string = (profile?.active_role || profile?.role || "").toString().toLowerCase();
  const canSeeTrialBanner = ADMIN_ROLES_THAT_SEE_TRIAL.has(role);

  const trialStatus: TrialStatus | null = (() => {
    if (!company) return null;
    const status = company.subscription_status;
    // A.13 #3 sweep: was checking 'trial' OR 'trialing'. 'trialing'
    // is no longer in the enum (migration 20260518740000).
    const isTrialStatus = status === "trial";
    if (!isTrialStatus || !company.trial_ends_at) {
      return { isInTrial: false, daysRemaining: 0, trialEndsAt: null };
    }
    const now = new Date();
    const trialEnd = new Date(company.trial_ends_at);
    const daysRemaining = Math.max(
      0,
      Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );
    return {
      isInTrial: daysRemaining >= 0,
      daysRemaining,
      trialEndsAt: company.trial_ends_at,
    };
  })();

  const handleDismiss = () => {
    setDismissed(true);
    // Store dismissal in localStorage for session
    if (trialStatus?.daysRemaining) {
      localStorage.setItem(`trial-banner-dismissed-${trialStatus.daysRemaining}`, "true");
    }
  };

  // Check if banner was already dismissed for this day count
  useEffect(() => {
    if (trialStatus?.daysRemaining !== undefined && trialStatus.daysRemaining !== null) {
      const wasDismissed = localStorage.getItem(`trial-banner-dismissed-${trialStatus.daysRemaining}`);
      if (wasDismissed === "true") {
        setDismissed(true);
      }
    }
  }, [trialStatus?.daysRemaining]);

  if (!canSeeTrialBanner || !trialStatus || !trialStatus.isInTrial || dismissed) {
    return null;
  }

  const { daysRemaining } = trialStatus;

  // Determine urgency styling
  let variant: "default" | "destructive" = "default";
  let bgColor = "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800";
  let textColor = "text-blue-900 dark:text-blue-100";
  let emoji = "📅";

  if (daysRemaining <= 1) {
    variant = "destructive";
    bgColor = "bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800";
    textColor = "bg-rose-50 dark:bg-rose-950/20";
    emoji = "🚨";
  } else if (daysRemaining <= 3) {
    bgColor = "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800";
    textColor = "text-orange-900 dark:text-orange-100";
    emoji = "⚠️";
  } else if (daysRemaining <= 7) {
    bgColor = "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800";
    textColor = "text-yellow-900 dark:text-yellow-100";
    emoji = "⏰";
  }

  const getMessage = () => {
    if (daysRemaining === 0) {
      return "Your trial expires today!";
    } else if (daysRemaining === 1) {
      return "Your trial expires tomorrow!";
    } else if (daysRemaining <= 3) {
      return `Your trial expires in ${daysRemaining} days`;
    } else {
      return `${daysRemaining} days left in your trial`;
    }
  };

  const getDescription = () => {
    if (daysRemaining <= 1) {
      return "Subscribe now to continue accessing all features without interruption.";
    } else if (daysRemaining <= 3) {
      return "Don't lose access to your data and features. Choose a plan that works for you.";
    } else {
      return "Upgrade to continue enjoying all CateringMS features after your trial ends.";
    }
  };

  return (
    // Horizontal padding so the banner lines up with page content
    // instead of touching the screen edges; overflow-hidden + wrapping
    // buttons so it never forces a horizontal scrollbar on mobile.
    <div className="relative px-4 sm:px-6 lg:px-8 pt-4 overflow-x-hidden">
      <Alert className={`${bgColor} border-2 ${textColor} mb-6`}>
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <AlertTitle className="text-base sm:text-lg font-semibold mb-2 break-words">
          {emoji} {getMessage()}
        </AlertTitle>
        <AlertDescription className="text-sm mb-4 break-words">
          {getDescription()}
        </AlertDescription>
        <div className="flex flex-wrap gap-2 sm:gap-3 mt-2">
          <Link href={`/${profile?.company_slug || "admin"}/admin/subscription`}>
            <Button size="sm" variant={daysRemaining <= 1 ? "destructive" : "default"}>
              View Subscription Plans
            </Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            className="gap-1"
          >
            <X className="h-4 w-4" />
            Dismiss
          </Button>
        </div>
      </Alert>
    </div>
  );
}