/**
 * Shared email + password validation for the auth pages
 * (login / register / company-signup) so the rules stay identical
 * everywhere.
 */

// Pragmatic email regex: one @, a dot in the domain, no spaces. Not
// RFC-5322-exhaustive on purpose - it catches real typos (missing @,
// missing TLD, trailing dot) without rejecting valid addresses.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password policy: at least 8 chars, with at least one letter AND one
// number. Stops "123456" / "password" style weak secrets at signup.
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(String(email || "").trim());
}

/**
 * Validate a NEW password against the policy. Returns the specific
 * reason it fails (for the error summary) or null when it passes.
 * Use on signup/registration - NOT on login, where you authenticate
 * an existing password that may predate the policy.
 */
export function validateNewPassword(password: string): string | null {
  const p = String(password || "");
  if (p.length < 8) return "Password must be at least 8 characters long.";
  if (!/[A-Za-z]/.test(p)) return "Password must include at least one letter.";
  if (!/\d/.test(p)) return "Password must include at least one number.";
  return null;
}
