import { Bell, CreditCard, Mail, Palette, Upload, Users, Utensils, type LucideIcon } from "lucide-react";

export const SETUP_TASKS = [
  { id: "team", title: "Add your team", description: "Invite the people who help run events.", href: "/admin/users", icon: Users },
  { id: "branding", title: "Set your branding", description: "Logo, colours, fonts, and client-facing identity.", href: "/admin/white-label", icon: Palette },
  { id: "email", title: "Set up company email", description: "Choose the sender and reply address clients see.", href: "/admin/email-settings", icon: Mail },
  { id: "reminders", title: "Set payment reminders and automatic emails", description: "When clients pay, one reminder, which emails go out.", href: "/admin/onboarding?step=reminders", icon: Bell },
  { id: "clients", title: "Bring in your clients", description: "Import an existing list or add the first client.", href: "/admin/onboarding/clients", icon: Upload },
  { id: "menu", title: "Add your menu and prices", description: "Create dishes and packages for quotes and orders.", href: "/admin/menu", icon: Utensils },
  { id: "payments", title: "Connect online payments", description: "Configure a gateway so clients can pay online.", href: "/admin/payment-gateways", icon: CreditCard },
] as const satisfies ReadonlyArray<{ id: string; title: string; description: string; href: string; icon: LucideIcon }>;

export type SetupTaskId = (typeof SETUP_TASKS)[number]["id"];

/**
 * Tasks that tick themselves from real settings, wherever they were saved
 * (onboarding or Settings). Reminders: payment due / reminder choice saved,
 * which onboardingProgressService reports as the setup_reminders step.
 */
export function setupTasksDoneFromSettings(
  onboardingSteps: ReadonlyArray<{ id: string; completed: boolean }> | undefined,
): Partial<Record<SetupTaskId, boolean>> {
  return onboardingSteps?.some((step) => step.id === "setup_reminders" && step.completed) ? { reminders: true } : {};
}
