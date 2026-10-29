import { createHash, timingSafeEqual } from "node:crypto";

/** One-time capability for signup when email confirmation yields no session. */
export function companyProvisionProofMatches(user: {
  created_at?: string;
  user_metadata?: Record<string, unknown>;
}, token: unknown, now = Date.now(), hashField = "company_provision_token_hash"): boolean {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return false;
  const stored = user.user_metadata?.[hashField];
  if (typeof stored !== "string" || !/^[0-9a-f]{64}$/.test(stored)) return false;
  const age = now - Date.parse(user.created_at || "");
  if (!Number.isFinite(age) || age < -60_000 || age > 30 * 60_000) return false;
  return timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(stored, "hex"));
}
