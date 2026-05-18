/**
 * Real-signal onboarding progress.
 *
 * Replaces the localStorage-driven mock progress that used to live in
 * onboardingService.ts. Each step's completion is derived from a quick
 * COUNT(*) query against the relevant table - so what the owner sees
 * always reflects reality, not stale browser state. Manual "I've done
 * this" steps (welcome, final_review) are tracked separately in
 * sessionStorage since they're trivial UI dismissals and don't belong
 * in the database.
 *
 * Completion + dismissal of the whole onboarding flow live on
 * companies.onboarding_completed_at / onboarding_dismissed_at - the two
 * timestamps drive the login-time auto-redirect and the day-zero
 * dashboard "First Steps" card respectively.
 */
import { supabase } from "@/integrations/supabase/client";

export interface OnboardingStepState {
  id: string;
  label: string;
  description: string;
  required: boolean;
  completed: boolean;
  /** For data-bearing steps: number of records that satisfy the step. */
  count?: number;
  /** Where to send the user when they click the step. Tenant-relative. */
  href: string;
  estimatedMinutes: number;
  icon: string;
}

export interface OnboardingState {
  steps: OnboardingStepState[];
  totalSteps: number;
  completedSteps: number;
  requiredSteps: number;
  completedRequiredSteps: number;
  /** True when every required step has its real-signal check satisfied. */
  allRequiredComplete: boolean;
  /** Timestamp from companies.onboarding_completed_at. */
  completedAt: string | null;
  /** Timestamp from companies.onboarding_dismissed_at. */
  dismissedAt: string | null;
  /** Convenience: progress as 0..100. */
  progressPct: number;
}

const SESSION_KEY = (companyId: string) => `onb_manual_${companyId}`;

interface ManualSteps {
  welcome?: boolean;
  final_review?: boolean;
}

function readManual(companyId: string): ManualSteps {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY(companyId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeManual(companyId: string, next: ManualSteps): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY(companyId), JSON.stringify(next));
  } catch {
    /* sessionStorage disabled - accept the loss */
  }
}

async function tableCount(table: string, companyId: string, extraEq?: { col: string; val: unknown }): Promise<number> {
  let q = supabase.from(table as never).select("*", { count: "exact", head: true }).eq("company_id", companyId);
  if (extraEq) q = q.eq(extraEq.col, extraEq.val as never);
  const { count, error } = await q;
  if (error) {
    console.warn(`[onboardingProgress] count(${table}) failed:`, error.message);
    return 0;
  }
  return count ?? 0;
}

export const onboardingProgressService = {
  async getState(companyId: string, slug: string): Promise<OnboardingState> {
    const manual = readManual(companyId);

    const [
      clientCount,
      orderCount,
      menuItemCount,
      inventoryCount,
      equipmentCount,
      staffProfileCount,
      kitchenStaffCount,
      activePaymentGatewayCount,
      companyRow,
    ] = await Promise.all([
      tableCount("clients", companyId),
      tableCount("orders", companyId),
      tableCount("menu_items", companyId),
      tableCount("inventory_items", companyId),
      tableCount("equipment", companyId),
      tableCount("profiles", companyId),
      tableCount("kitchen_staff_members", companyId),
      tableCount("payment_gateways", companyId, { col: "is_active", val: true }),
      supabase
        .from("companies")
        .select("company_name,phone,email,onboarding_completed_at,onboarding_dismissed_at")
        .eq("id", companyId)
        .maybeSingle(),
    ]);

    const company = companyRow.data;
    const completedAt = company?.onboarding_completed_at ?? null;
    const dismissedAt = company?.onboarding_dismissed_at ?? null;

    // Company info is "complete" when the basics are in - company_name +
    // phone exist (signup ensures both).
    const companyInfoComplete = !!(company?.company_name && company?.phone);

    // Team is "complete" when there's at least one staff record beyond the
    // owner. Either an extra profile or a kitchen_staff_members entry.
    const teamComplete = staffProfileCount > 1 || kitchenStaffCount > 0;

    const tenantPath = slug ? `/${slug}` : "";

    const steps: OnboardingStepState[] = [
      {
        id: "welcome",
        label: "Welcome",
        description: "Quick tour of what to expect",
        required: true,
        completed: !!manual.welcome,
        href: `${tenantPath}/admin/onboarding`,
        estimatedMinutes: 2,
        icon: "👋",
      },
      {
        id: "company_info",
        label: "Company profile",
        description: "Name, contact, branding - the basics on every quote",
        required: true,
        completed: companyInfoComplete,
        href: `${tenantPath}/admin/company-profile`,
        estimatedMinutes: 5,
        icon: "🏢",
      },
      {
        id: "import_team",
        label: "Add your team",
        description: "Kitchen, drivers, cleaning - so they can clock in",
        required: true,
        completed: teamComplete,
        count: staffProfileCount + kitchenStaffCount,
        href: `${tenantPath}/admin/staff`,
        estimatedMinutes: 10,
        icon: "👨‍🍳",
      },
      {
        id: "import_products",
        label: "Build your menu",
        description: "What you cook + per-portion pricing",
        required: false,
        completed: menuItemCount > 0,
        count: menuItemCount,
        href: `${tenantPath}/admin/menu`,
        estimatedMinutes: 15,
        icon: "🍽️",
      },
      {
        id: "import_clients",
        label: "Import clients",
        description: "Existing client database - skip if you're starting fresh",
        required: false,
        completed: clientCount > 0,
        count: clientCount,
        href: `${tenantPath}/admin/contacts`,
        estimatedMinutes: 10,
        icon: "👥",
      },
      {
        id: "import_bookings",
        label: "Add upcoming bookings",
        description: "Confirmed events you already have on the books",
        required: false,
        completed: orderCount > 0,
        count: orderCount,
        href: `${tenantPath}/admin/orders`,
        estimatedMinutes: 15,
        icon: "📅",
      },
      {
        id: "import_inventory",
        label: "Stock + ingredients",
        description: "What you keep in - drives shopping demand calc",
        required: false,
        completed: inventoryCount > 0,
        count: inventoryCount,
        href: `${tenantPath}/admin/inventory`,
        estimatedMinutes: 20,
        icon: "📦",
      },
      {
        id: "import_equipment",
        label: "Equipment",
        description: "Cutlery, chafing dishes, gear you take on site",
        required: false,
        completed: equipmentCount > 0,
        count: equipmentCount,
        href: `${tenantPath}/admin/equipment`,
        estimatedMinutes: 15,
        icon: "🍴",
      },
      {
        id: "setup_payment",
        label: "Payment gateway",
        description: "Connect PayFast so clients can pay quotes online",
        required: true,
        completed: activePaymentGatewayCount > 0,
        href: `${tenantPath}/admin/integrations`,
        estimatedMinutes: 5,
        icon: "💳",
      },
      {
        id: "final_review",
        label: "Review + launch",
        description: "Final once-over before you go live",
        required: true,
        completed: !!manual.final_review,
        href: `${tenantPath}/admin/onboarding`,
        estimatedMinutes: 5,
        icon: "🚀",
      },
    ];

    const completedSteps = steps.filter((s) => s.completed).length;
    const requiredSteps = steps.filter((s) => s.required).length;
    const completedRequiredSteps = steps.filter((s) => s.required && s.completed).length;
    const allRequiredComplete = completedRequiredSteps === requiredSteps;

    return {
      steps,
      totalSteps: steps.length,
      completedSteps,
      requiredSteps,
      completedRequiredSteps,
      allRequiredComplete,
      completedAt,
      dismissedAt,
      progressPct: Math.round((completedSteps / steps.length) * 100),
    };
  },

  async markStepDone(companyId: string, stepId: "welcome" | "final_review"): Promise<void> {
    const manual = readManual(companyId);
    manual[stepId] = true;
    writeManual(companyId, manual);
  },

  async unmarkStep(companyId: string, stepId: "welcome" | "final_review"): Promise<void> {
    const manual = readManual(companyId);
    delete manual[stepId];
    writeManual(companyId, manual);
  },

  async markComplete(companyId: string): Promise<{ error?: string }> {
    const { error } = await supabase
      .from("companies")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", companyId);
    return error ? { error: error.message } : {};
  },

  async unmarkComplete(companyId: string): Promise<{ error?: string }> {
    const { error } = await supabase
      .from("companies")
      .update({ onboarding_completed_at: null })
      .eq("id", companyId);
    return error ? { error: error.message } : {};
  },

  async dismissDashboardCard(companyId: string): Promise<{ error?: string }> {
    const { error } = await supabase
      .from("companies")
      .update({ onboarding_dismissed_at: new Date().toISOString() })
      .eq("id", companyId);
    return error ? { error: error.message } : {};
  },
};
