/**
 * Sign-in activity bucketing.
 *
 * USR2-A. Shared by the two staff-list surfaces - /admin/users (full
 * team management) and /[slug]/admin/users (simpler tenant-side
 * onboarding view). Reads profiles.last_sign_in_at, which the
 * auth_users_last_sign_in_mirror trigger keeps in sync with
 * auth.users.last_sign_in_at on every login (Supabase Auth updates it
 * on each session refresh).
 *
 * Buckets:
 *   active = signed in within 7 days       (emerald)
 *   stale  = signed in 8-30 days ago        (amber)
 *   ghost  = signed in 30+ days ago         (rose)
 *   never  = no last_sign_in_at recorded    (slate, italic)
 */

import { formatDistanceToNow } from "date-fns";

export type LoginActivityBucket = {
  kind: "never" | "active" | "stale" | "ghost";
  label: string;
  tone: string;
};

export function loginActivityBucket(
  lastSignInAt: string | null | undefined,
): LoginActivityBucket {
  if (!lastSignInAt) {
    return {
      kind: "never",
      label: "Never signed in",
      tone: "bg-slate-100 text-slate-600 border-slate-200",
    };
  }
  const ageMs = Date.now() - new Date(lastSignInAt).getTime();
  const days = ageMs / 86400000;
  if (days <= 7) {
    return {
      kind: "active",
      label: `Active ${formatDistanceToNow(new Date(lastSignInAt), { addSuffix: true })}`,
      tone: "bg-brand-primary/10 text-brand-primary border-brand-primary/20",
    };
  }
  if (days <= 30) {
    return {
      kind: "stale",
      label: `${Math.floor(days)}d since sign-in`,
      tone: "bg-amber-50 text-amber-700 border-amber-200",
    };
  }
  return {
    kind: "ghost",
    label: `${Math.floor(days)}d since sign-in`,
    tone: "bg-rose-50 text-rose-700 border-rose-200",
  };
}
