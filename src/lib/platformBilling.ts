/** Single source of truth for the platform SaaS trial window. */
export const PLATFORM_TRIAL_DAYS = 30;

export function getPlatformTrialEndDate(from = new Date()): Date {
  return new Date(from.getTime() + PLATFORM_TRIAL_DAYS * 24 * 60 * 60 * 1000);
}
